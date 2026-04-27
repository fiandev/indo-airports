import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const BASE_URL = "https://en.wikipedia.org/wiki/List_of_airports_in_Indonesia";

interface Airport {
    location: string;
    province: string;
    icao: string;
    iata: string;
    name: string;
    coordinates: string | null;
    latitude: number | null;
    longitude: number | null;
    status?: string;
    namedAfter: string;
}

interface ScrapedData {
    source: string;
    scrapedAt: string;
    total: number;
    airports: Airport[];
}

function parseGeoCoords(cell: cheerio.Cheerio<AnyNode>): {
    raw: string | null;
    lat: number | null;
    lng: number | null;
} {
    const geoEl = cell.find(".geo");
    if (geoEl.length) {
        const text = geoEl.first().text().trim();
        const parts = text.split(";").map((s) => s.trim());
        if (parts.length === 2) {
            const lat = parseFloat(parts[0] ?? "");
            const lng = parseFloat(parts[1] ?? "");
            if (!isNaN(lat) && !isNaN(lng)) {
                return { raw: text, lat, lng };
            }
        }
    }

    const dmsEl = cell.find(".geo-dms");
    if (dmsEl.length) {
        const latText = dmsEl.find(".latitude").text().trim();
        const lngText = dmsEl.find(".longitude").text().trim();
        const raw = latText && lngText ? `${latText} ${lngText}` : dmsEl.text().trim();
        return { raw: raw || null, lat: null, lng: null };
    }

    const rawText = cell.text().trim();
    if (rawText) return { raw: rawText, lat: null, lng: null };
    return { raw: null, lat: null, lng: null };
}

function scrapeTable(
    $: cheerio.CheerioAPI,
    table: cheerio.Cheerio<AnyNode>,
    totalCols: number
): { cells: string[]; $row: cheerio.Cheerio<AnyNode> }[] {
    const rows = table.find("tr");
    const result: { cells: string[]; $row: cheerio.Cheerio<AnyNode> }[] = [];

    const rowspanCarry: Map<number, { value: string; remaining: number }> = new Map();

    rows.each((_, row) => {
        const $row = $(row);
        if ($row.find("th").length > 0) return;

        const isSectionHeader =
            $row.attr("style")?.includes("font-weight:bold") ||
            ($row.find("td[colspan]").length > 0 && $row.find("td").length === 1);
        if (isSectionHeader) return;

        const tds = $row.find("td");
        if (tds.length === 0) return;

        const resolved: string[] = new Array(totalCols).fill("");

        let tdIdx = 0;

        for (let col = 0; col < totalCols; col++) {
            if (rowspanCarry.has(col)) {
                const carry = rowspanCarry.get(col)!;
                resolved[col] = carry.value;
                carry.remaining--;
                if (carry.remaining === 0) rowspanCarry.delete(col);
            } else {
                const td = tds.eq(tdIdx);
                if (!td.length) {
                    resolved[col] = "";
                    continue;
                }
                const text = td.text().trim().replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();
                resolved[col] = text;

                const rowspan = parseInt(td.attr("rowspan") ?? "1", 10);
                if (rowspan > 1) {
                    rowspanCarry.set(col, { value: text, remaining: rowspan - 1 });
                }

                const colspan = parseInt(td.attr("colspan") ?? "1", 10);
                tdIdx++;

                if (colspan > 1) {
                    for (let extra = 1; extra < colspan; extra++) {
                        if (col + extra < totalCols) resolved[col + extra] = text;
                    }
                    col += colspan - 1;
                }
            }
        }

        result.push({ cells: resolved, $row });
    });

    return result;
}

function buildAirports(
    rows: { cells: string[]; $row: cheerio.Cheerio<AnyNode> }[],
    includeStatus: boolean,
    $: cheerio.CheerioAPI
): Airport[] {
    const airports: Airport[] = [];

    for (const { cells, $row } of rows) {
        const coordCellEl = $row.find("td").filter((_, td) => {
            return $(td).find(".geo, .geo-dms, .geo-inline").length > 0;
        });

        let coordData = { raw: null as string | null, lat: null as number | null, lng: null as number | null };
        if (coordCellEl.length) {
            coordData = parseGeoCoords($(coordCellEl[0]!));
        } else {
            const rawCoord = cells[5] ?? "";
            if (rawCoord) coordData = { raw: rawCoord, lat: null, lng: null };
        }

        const airport: Airport = {
            location: cells[0] ?? "",
            province: cells[1] ?? "",
            icao: cells[2] ?? "",
            iata: cells[3] ?? "",
            name: cells[4] ?? "",
            coordinates: coordData.raw,
            latitude: coordData.lat,
            longitude: coordData.lng,
            namedAfter: includeStatus ? (cells[7] ?? "") : (cells[6] ?? ""),
        };

        if (includeStatus) {
            airport.status = cells[6] ?? "";
        }

        if (airport.location || airport.icao || airport.iata || airport.name) {
            airports.push(airport);
        }
    }

    return airports;
}

async function scrape(): Promise<void> {
    console.log(`Fetching: ${BASE_URL}`);

    const response = await fetch(BASE_URL, {
        headers: {
            "User-Agent":
                "Mozilla/5.0 (compatible; AirportScraper/1.0; +https://github.com/example)",
            "Accept-Language": "en-US,en;q=0.9",
        },
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const tables = $("table.wikitable.sortable");
    console.log(`Found ${tables.length} wikitable(s)`);

    const civilianRaw = scrapeTable($, tables.eq(0), 9);
    const militaryRaw = scrapeTable($, tables.eq(1), 8);
    const defunctRaw = scrapeTable($, tables.eq(2), 8);

    const civilian = buildAirports(civilianRaw, true, $);
    const military = buildAirports(militaryRaw, false, $);
    const defunct = buildAirports(defunctRaw, false, $);

    console.log(`Civilian airports: ${civilian.length}`);
    console.log(`Military airports: ${military.length}`);
    console.log(`Defunct airports:  ${defunct.length}`);
    console.log(`Total:             ${civilian.length + military.length + defunct.length}`);

    const dataDir = join(import.meta.dir, "data");
    await mkdir(dataDir, { recursive: true });

    const scrapedAt = new Date().toISOString();

    const datasets: Array<{ file: string; data: ScrapedData }> = [
        {
            file: "civilian_airports.json",
            data: { source: BASE_URL, scrapedAt, total: civilian.length, airports: civilian },
        },
        {
            file: "military_airports.json",
            data: { source: BASE_URL, scrapedAt, total: military.length, airports: military },
        },
        {
            file: "defunct_airports.json",
            data: { source: BASE_URL, scrapedAt, total: defunct.length, airports: defunct },
        },
        {
            file: "all_airports.json",
            data: {
                source: BASE_URL,
                scrapedAt,
                total: civilian.length + military.length + defunct.length,
                airports: [...civilian, ...military, ...defunct],
            },
        },
    ];

    for (const { file, data } of datasets) {
        const outPath = join(dataDir, file);
        await writeFile(outPath, JSON.stringify(data, null, 2), "utf-8");
        console.log(`Saved → ./data/${file} (${data.total} records)`);
    }

    console.log("\nDone!");
}

scrape().catch((err) => {
    console.error("Scrape failed:", err);
    process.exit(1);
});
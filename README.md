# Indo Airports

A scraper that extracts all airport data from the [Wikipedia list of airports in Indonesia](https://en.wikipedia.org/wiki/List_of_airports_in_Indonesia) and stores it as structured JSON — refreshed automatically **3 times a day** via GitHub Actions.

## Data

Scraped data is saved to `./data/`:

| File                     | Description                                 | Records |
| ------------------------ | ------------------------------------------- | ------- |
| `civilian_airports.json` | Civilian / joint civilian-military airports | ~185    |
| `military_airports.json` | Military-exclusive airports                 | ~7      |
| `defunct_airports.json`  | Defunct / closed airports                   | ~12     |
| `all_airports.json`      | All of the above combined                   | ~204    |

Each airport entry contains:

```json
{
  "location": "Bawean",
  "province": "East Java",
  "icao": "WARW",
  "iata": "BXW",
  "name": "Harun Thohir Airport",
  "coordinates": "-5.72361; 112.67917",
  "latitude": -5.72361,
  "longitude": 112.67917,
  "status": "Civilian",
  "namedAfter": "Harun Thohir, a National Hero of Indonesia"
}
```

> `status` is only present in the civilian airports dataset.

## Usage

**Install dependencies:**

```bash
bun install
```

**Run the scraper:**

```bash
bun run index.ts
```

## Stack

- **Runtime:** [Bun](https://bun.com)
- **HTML parsing:** [cheerio](https://cheerio.js.org)
- **Source:** [Wikipedia — List of airports in Indonesia](https://en.wikipedia.org/wiki/List_of_airports_in_Indonesia)

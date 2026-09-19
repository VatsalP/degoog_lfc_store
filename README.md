# Live Matches Store

A small custom [Degoog](https://github.com/degoog-org/degoog) extension store focused on useful, low-cost match information.

## Included extension

### Liverpool Matches

A result slot that shows Liverpool FC live scores, recent results, and upcoming fixtures for searches such as:

- `lfc`
- `liverpool score`
- `liverpool live`
- `liverpool next match`
- `liverpool fixtures`
- `arsenal vs liverpool`

The slot uses free data sources with layered fallbacks and an adaptive in-memory cache. See [the plugin documentation](plugins/liverpool-matches/README.md) for provider and configuration details.

## Add this store to Degoog

1. Push this directory to a Git repository that your Degoog server can access.
2. In Degoog, open **Settings → Store**.
3. Paste the Git clone URL into **Add repository**.
4. Install **Liverpool Matches** from the catalogue.
5. Optionally configure a free API-Football key in the plugin settings.

Degoog clones store repositories directly; there is no marketplace server between Degoog and this repository.

## Development

Run the deterministic unit tests with:

```bash
npm test
```

The tests do not contact external providers.

## Data-source notice

API-Football is supported but requires a free account key. FixtureDownload is used for schedule fallback. ESPN fallback uses undocumented public JSON endpoints, is enabled by default for zero-configuration operation, and may stop working if ESPN changes them.

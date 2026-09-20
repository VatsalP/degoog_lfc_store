# Liverpool Matches

A Degoog result slot for Liverpool FC scores and fixtures. It appears above web results only when a query has clear Liverpool match intent.

Provider timestamps are stored as UTC. The browser converts each kickoff to the user's local timezone and displays its timezone abbreviation.

## Example searches

- `lfc`
- `liverpool score`
- `liverpool live`
- `liverpool next match`
- `liverpool fixtures`
- `liverpool results`
- `arsenal vs liverpool`

Searches about Liverpool the city, such as `Liverpool weather`, do not activate the slot.

## Data sources

1. **API-Football** when a key is configured. Its free plan is sufficient for light personal use, but has a daily request quota.
2. **ESPN's public JSON endpoints** to cross-check today's live score and, when API-Football is unavailable, provide the full fallback. These endpoints are undocumented and may change without notice.
3. **FixtureDownload** for Premier League and Champions League schedules and completed results. This source is not treated as live.

No HTML match pages are scraped. Every card identifies its source.

## Configuration

### API-Football key

Create a free API-Football account, copy its API key, and save it in the plugin settings. Degoog stores this as a secret and requests are made server-side.

The key is optional. Without it, the plugin uses ESPN when that fallback is enabled.

### ESPN fallback

Enabled by default so the plugin works without an API key. It uses unsupported public JSON endpoints, so FixtureDownload remains the final schedule fallback.

### FixtureDownload feeds

By default the plugin derives the current European season and loads Liverpool's Premier League and Champions League JSON feeds. You can replace these with explicit HTTPS FixtureDownload JSON feed URLs in settings.

## Cache policy

The cache is held in the Degoog server process and is reset when Degoog restarts.

- Normal fixtures: 60 minutes by default
- Match within 24 hours: 30 minutes
- Match within 90 minutes: 10 minutes
- Scheduled kickoff up to four hours ago: 2 minutes, so a slow schedule feed cannot hide a live match
- Live match: 2 minutes
- Stale-if-error copy: 24 hours

The plugin never polls in the background. A provider request occurs only when a matching search is made after the relevant cache has expired.

## Limitations

- FixtureDownload is a schedule and final-result fallback, not a real-time source.
- ESPN's endpoints are unofficial and unsupported.
- Cup and friendly coverage varies by provider.
- In-memory cached data is lost when the Degoog server restarts.

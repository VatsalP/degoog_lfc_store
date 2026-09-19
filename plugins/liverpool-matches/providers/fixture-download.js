const FIXTURE_BASE = "https://fixturedownload.com/feed/json";

const seasonStartYear = (now) => {
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 5 ? year : year - 1;
};

const defaultFeeds = (now) => {
  const season = seasonStartYear(now);
  return [
    { competition: "Premier League", url: `${FIXTURE_BASE}/epl-${season}/liverpool` },
    { competition: "Champions League", url: `${FIXTURE_BASE}/champions-league-${season}/liverpool` },
  ];
};

export const normalizeFixtureDownloadMatch = (item, competition = "Football") => {
  const homeScore = item?.HomeTeamScore == null ? null : Number(item.HomeTeamScore);
  const awayScore = item?.AwayTeamScore == null ? null : Number(item.AwayTeamScore);
  const finished = Number.isFinite(homeScore) && Number.isFinite(awayScore);
  const rawDate = String(item?.DateUtc || "").trim();
  const kickoff = rawDate ? rawDate.replace(" ", "T") : null;

  return {
    id: `fixture-download:${competition}:${item?.MatchNumber ?? ""}:${rawDate}`,
    providerId: String(item?.MatchNumber ?? ""),
    homeTeam: item?.HomeTeam || "Home",
    awayTeam: item?.AwayTeam || "Away",
    competition,
    round: item?.RoundNumber != null ? `Round ${item.RoundNumber}` : "",
    kickoff,
    status: finished ? "finished" : "scheduled",
    statusDetail: finished ? "FT" : "Scheduled",
    minute: null,
    homeScore: finished ? homeScore : null,
    awayScore: finished ? awayScore : null,
    venue: item?.Location || "",
    source: "FixtureDownload",
    sourcePriority: 10,
    sourceUrl: "",
  };
};

const parseCustomFeeds = (urls) => {
  if (!Array.isArray(urls)) return [];
  return urls
    .filter((url) => typeof url === "string" && /^https:\/\//i.test(url.trim()))
    .map((url) => ({ competition: "Football", url: url.trim() }));
};

export async function fetchFixtureDownloadMatches({
  fetchFn = fetch,
  now = new Date(),
  feedUrls = [],
} = {}) {
  const custom = parseCustomFeeds(feedUrls);
  const feeds = custom.length > 0 ? custom : defaultFeeds(now);
  const requests = feeds.map(async ({ competition, url }) => {
    const response = await fetchFn(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`${competition}: HTTP ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error(`${competition}: invalid response`);
    return body
      .map((item) => normalizeFixtureDownloadMatch(item, competition))
      .filter((match) => match.kickoff);
  });

  const settled = await Promise.allSettled(requests);
  const matches = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const failed = settled.filter((result) => result.status === "rejected").length;

  return {
    ok: matches.length > 0,
    matches,
    reason: matches.length > 0 ? "" : `No fixture feeds returned (${failed} requests failed)`,
    partial: failed > 0,
  };
}

export const fixtureDownloadFeedsFor = defaultFeeds;

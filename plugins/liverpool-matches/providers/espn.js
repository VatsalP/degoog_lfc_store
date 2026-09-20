const ESPN_TEAM_ID = "364";
const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

const DEFAULT_LEAGUES = [
  "eng.1",
  "uefa.champions",
  "eng.fa",
  "eng.league_cup",
  "uefa.europa",
  "fifa.cwc",
  "club.friendly",
];

const leagueLabel = (event, league) =>
  event?.league?.abbreviation ||
  event?.league?.shortName ||
  event?.league?.name ||
  event?.seasonType?.name ||
  league;

const scoreValue = (competitor) => {
  const raw = competitor?.score?.displayValue ?? competitor?.score?.value ?? competitor?.score;
  if (raw == null || raw === "") return null;
  const value = Number.parseInt(String(raw), 10);
  return Number.isFinite(value) ? value : null;
};

const normalizeStatus = (status) => {
  const type = status?.type || {};
  const state = String(type.state || "").toLowerCase();
  const name = String(type.name || "").toUpperCase();
  const description = String(type.description || type.detail || "");

  if (name.includes("HALF_TIME") || /half.?time/i.test(description)) return "halftime";
  if (state === "in") return "live";
  if (type.completed || state === "post") return "finished";
  if (/postpon/i.test(description)) return "postponed";
  if (/cancel|abandon/i.test(description)) return "cancelled";
  return "scheduled";
};

export const normalizeEspnEvent = (event, league) => {
  const competition = event?.competitions?.[0] || {};
  const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
  const home = competitors.find((team) => team.homeAway === "home") || competitors[0] || {};
  const away = competitors.find((team) => team.homeAway === "away") || competitors[1] || {};
  const status = competition.status || event?.status || {};
  const displayClock = status?.displayClock || "";
  const minuteMatch = String(displayClock).match(/\d+/);
  const link = (event?.links || []).find((item) =>
    Array.isArray(item?.rel) && item.rel.includes("summary") && item.rel.includes("desktop"),
  );

  return {
    id: `espn:${event?.id || competition?.id || "unknown"}`,
    providerId: String(event?.id || competition?.id || ""),
    homeTeam: home?.team?.displayName || home?.team?.shortDisplayName || "Home",
    awayTeam: away?.team?.displayName || away?.team?.shortDisplayName || "Away",
    competition: leagueLabel(event, league),
    round: event?.seasonType?.name || "",
    kickoff: competition.date || event?.date || null,
    status: normalizeStatus(status),
    statusDetail: status?.type?.shortDetail || status?.type?.description || "",
    minute: minuteMatch ? Number.parseInt(minuteMatch[0], 10) : null,
    homeScore: scoreValue(home),
    awayScore: scoreValue(away),
    venue: competition?.venue?.fullName || "",
    source: "ESPN (unofficial)",
    sourcePriority: 20,
    sourceUrl: link?.href || "",
  };
};

const isLiverpoolEvent = (event) => {
  const competitors = event?.competitions?.[0]?.competitors || [];
  return competitors.some((entry) =>
    String(entry?.team?.id || "") === ESPN_TEAM_ID ||
    /^(liverpool|liverpool fc)$/i.test(String(entry?.team?.displayName || "").trim()),
  );
};

const espnDate = (date) =>
  `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;

export async function fetchEspnMatches({
  fetchFn = fetch,
  leagues = DEFAULT_LEAGUES,
  now = new Date(),
  includeSchedules = true,
} = {}) {
  const requests = leagues.flatMap((league) => {
    const base = `${ESPN_BASE}/${encodeURIComponent(league)}`;
    const urls = [`${base}/scoreboard?dates=${espnDate(now)}&limit=100`];
    if (includeSchedules) urls.push(`${base}/teams/${ESPN_TEAM_ID}/schedule`);
    return urls.map(async (url) => {
      const response = await fetchFn(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`${league}: HTTP ${response.status}`);
      const body = await response.json();
      return (Array.isArray(body?.events) ? body.events : [])
        .filter(isLiverpoolEvent)
        .map((event) => normalizeEspnEvent(event, league))
        .filter((match) => match.kickoff);
    });
  });

  const settled = await Promise.allSettled(requests);
  const matches = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const failed = settled.filter((result) => result.status === "rejected").length;

  return {
    ok: matches.length > 0,
    matches,
    reason: matches.length > 0 ? "" : `No ESPN matches returned (${failed} requests failed)`,
    partial: failed > 0,
  };
}

export const ESPN_LEAGUES = DEFAULT_LEAGUES;

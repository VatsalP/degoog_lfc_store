const API_BASE = "https://v3.football.api-sports.io";
const LIVERPOOL_TEAM_ID = 40;

const pad = (value) => String(value).padStart(2, "0");

const dateOnly = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const statusFromShortCode = (short) => {
  const code = String(short || "").toUpperCase();
  if (["1H", "2H", "ET", "P", "BT", "LIVE", "INT"].includes(code)) return "live";
  if (code === "HT") return "halftime";
  if (["FT", "AET", "PEN"].includes(code)) return "finished";
  if (["PST", "SUSP"].includes(code)) return "postponed";
  if (["CANC", "ABD", "AWD", "WO"].includes(code)) return "cancelled";
  return "scheduled";
};

export const normalizeApiFootballFixture = (item) => {
  const fixture = item?.fixture || {};
  const home = item?.teams?.home || {};
  const away = item?.teams?.away || {};
  const status = statusFromShortCode(fixture?.status?.short);
  const elapsed = Number(fixture?.status?.elapsed);

  return {
    id: `api-football:${fixture.id}`,
    providerId: String(fixture.id || ""),
    homeTeam: home.name || "Home",
    awayTeam: away.name || "Away",
    competition: item?.league?.name || "Football",
    round: item?.league?.round || "",
    kickoff: fixture.date || null,
    status,
    statusDetail: fixture?.status?.long || "",
    minute: Number.isFinite(elapsed) ? elapsed : null,
    homeScore: item?.goals?.home ?? null,
    awayScore: item?.goals?.away ?? null,
    venue: fixture?.venue?.name || "",
    source: "API-Football",
    sourcePriority: 30,
    sourceUrl: "",
  };
};

export async function fetchApiFootballMatches({ apiKey, fetchFn = fetch, now = new Date() }) {
  if (!apiKey) return { ok: false, matches: [], reason: "API key not configured" };

  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 30);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + 90);
  const params = new URLSearchParams({
    team: String(LIVERPOOL_TEAM_ID),
    from: dateOnly(from),
    to: dateOnly(to),
    timezone: "UTC",
  });

  try {
    const response = await fetchFn(`${API_BASE}/fixtures?${params}`, {
      headers: {
        Accept: "application/json",
        "x-apisports-key": apiKey,
      },
    });
    if (!response.ok) {
      return { ok: false, matches: [], reason: `HTTP ${response.status}` };
    }

    const body = await response.json();
    if (body?.errors && Object.keys(body.errors).length > 0) {
      return {
        ok: false,
        matches: [],
        reason: Object.values(body.errors).map(String).join("; "),
      };
    }

    return {
      ok: true,
      matches: Array.isArray(body?.response)
        ? body.response.map(normalizeApiFootballFixture).filter((match) => match.kickoff)
        : [],
      remaining: response.headers?.get?.("x-ratelimit-requests-remaining") || null,
    };
  } catch (error) {
    return {
      ok: false,
      matches: [],
      reason: error instanceof Error ? error.message : "Network error",
    };
  }
}

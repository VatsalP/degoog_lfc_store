import { fetchApiFootballMatches } from "./providers/api-football.js";
import { fetchEspnMatches } from "./providers/espn.js";
import { fetchFixtureDownloadMatches } from "./providers/fixture-download.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const LIVE_STATUSES = new Set(["live", "halftime", "extra-time", "penalties"]);

let apiFootballKey = "";
let enableEspnFallback = true;
let normalCacheMinutes = 60;
let maxUpcoming = 5;
let customFixtureFeeds = [];
let template = "";

const cache = {
  value: null,
  fetchedAt: 0,
  expiresAt: 0,
  staleUntil: 0,
};

const asBoolean = (value, fallback) => {
  if (value == null || value === "") return fallback;
  return value === true || value === "true" || value === "1" || value === 1;
};

const boundedInt = (value, fallback, min, max) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};

const parseUrlList = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Degoog may provide newline-delimited values on older versions.
  }
  return value.split("\n").map((entry) => entry.trim()).filter(Boolean);
};

const normalizeTeamName = (name) => String(name || "")
  .toLowerCase()
  .replace(/\b(fc|afc|football club)\b/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const matchKey = (match) => {
  const day = String(match.kickoff || "").slice(0, 10);
  return `${normalizeTeamName(match.homeTeam)}:${normalizeTeamName(match.awayTeam)}:${day}`;
};

export const mergeMatches = (groups) => {
  const merged = new Map();
  for (const match of groups.flat()) {
    if (!match?.kickoff) continue;
    const key = matchKey(match);
    const current = merged.get(key);
    const currentHasState = current && current.status !== "scheduled";
    const candidateHasState = match.status !== "scheduled";
    const candidateIsBetter =
      !current ||
      (candidateHasState && !currentHasState) ||
      (candidateHasState === currentHasState &&
        (match.sourcePriority || 0) > (current.sourcePriority || 0));
    if (candidateIsBetter) merged.set(key, match);
  }
  return [...merged.values()].sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
  );
};

const cacheTtl = (matches, now) => {
  if (matches.some((match) => LIVE_STATUSES.has(match.status))) return 2 * 60 * 1000;

  const scheduledDiffs = matches
    .filter((match) => match.status === "scheduled")
    .map((match) => new Date(match.kickoff).getTime() - now.getTime())
    .filter(Number.isFinite)
    .sort((a, b) => Math.abs(a) - Math.abs(b));
  const nearest = scheduledDiffs[0];

  // A schedule-only provider may not flip its status at kickoff. Keep probing
  // live providers for the length of a football match instead of caching the
  // stale "scheduled" state for an hour.
  if (nearest != null && nearest <= 0 && nearest >= -4 * HOUR_MS) return 2 * 60 * 1000;
  if (nearest != null && nearest <= 90 * 60 * 1000 && nearest > 0) return 10 * 60 * 1000;
  if (nearest != null && nearest <= DAY_MS && nearest > 0) return 30 * 60 * 1000;
  return normalCacheMinutes * 60 * 1000;
};

const getMatchData = async (fetchFn, now = new Date()) => {
  const time = now.getTime();
  if (cache.value && time < cache.expiresAt) {
    return { ...cache.value, cacheHit: true };
  }

  const fixturePromise = fetchFixtureDownloadMatches({
    fetchFn,
    now,
    feedUrls: customFixtureFeeds,
  });

  const primary = apiFootballKey
    ? await fetchApiFootballMatches({ apiKey: apiFootballKey, fetchFn, now })
    : { ok: false, matches: [], reason: "API-Football key not configured" };

  let espn = { ok: false, matches: [], reason: "ESPN fallback disabled" };
  if (enableEspnFallback) {
    espn = await fetchEspnMatches({
      fetchFn,
      now,
      includeSchedules: !primary.ok || primary.matches.length === 0,
    });
  }

  const fixtures = await fixturePromise;
  const matches = mergeMatches([
    primary.ok ? primary.matches : [],
    espn.ok ? espn.matches : [],
    fixtures.ok ? fixtures.matches : [],
  ]);

  if (matches.length === 0) {
    if (cache.value && time < cache.staleUntil) {
      return { ...cache.value, stale: true, cacheHit: true };
    }
    return {
      matches: [],
      sources: [],
      fetchedAt: time,
      error: [primary.reason, espn.reason, fixtures.reason].filter(Boolean).join(" · "),
    };
  }

  const value = {
    matches,
    sources: [...new Set(matches.map((match) => match.source))],
    fetchedAt: time,
    stale: false,
    apiRemaining: primary.remaining || null,
  };
  const ttl = cacheTtl(matches, now);
  cache.value = value;
  cache.fetchedAt = time;
  cache.expiresAt = time + ttl;
  cache.staleUntil = time + DAY_MS;
  return value;
};

export const hasLiverpoolMatchIntent = (query) => {
  const q = String(query || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (q === "lfc") return true;
  const hasLiverpool = /\b(liverpool|liverpool fc|liverpoolfc|lfc)\b/.test(q);
  if (!hasLiverpool) return false;
  return /\b(score|scores|live|match|matches|fixture|fixtures|result|results|playing|play|played|game|games|football|soccer|kickoff|kick off|next|today|tonight|tomorrow|versus|vs)\b/.test(q);
};

export const queryIntent = (query) => {
  const q = String(query || "").toLowerCase();
  if (/\b(result|results|last match|played)\b/.test(q)) return "results";
  if (/\b(fixture|fixtures|next|when|tomorrow)\b/.test(q)) return "fixtures";
  if (/\b(live|playing now)\b/.test(q)) return "live";
  return "summary";
};

const esc = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const icon = (name, className = "") => {
  const paths = {
    ball: '<circle cx="12" cy="12" r="9"></circle><path d="m9.5 9 2.5-2 2.5 2-.9 3h-3.2z"></path><path d="m6 5 3.5 4M18 5l-3.5 4M4 13l6.4-1M20 13l-6.4-1M8 20l2.4-8M16 20l-2.4-8"></path>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path>',
    live: '<path d="M4.9 19.1a10 10 0 0 1 0-14.2M8.5 15.5a5 5 0 0 1 0-7M19.1 4.9a10 10 0 0 1 0 14.2M15.5 8.5a5 5 0 0 1 0 7"></path><circle cx="12" cy="12" r="1.5"></circle>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5M12 7v5l3 2"></path>',
    pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2.5"></circle>',
    source: '<ellipse cx="12" cy="5" rx="8" ry="3"></ellipse><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"></path>',
  };
  return `<svg class="lfc-icon${className ? ` ${className}` : ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || paths.ball}</svg>`;
};

const sectionIcon = (heading) => {
  if (/live/i.test(heading)) return icon("live");
  if (/result/i.test(heading)) return icon("history");
  return icon("calendar");
};

const dateLabel = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Time TBC";
  return date.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const statusLabel = (match) => {
  if (match.status === "live") return match.minute != null ? `${match.minute}′` : "LIVE";
  if (match.status === "halftime") return "HT";
  if (match.status === "finished") return "FT";
  if (match.status === "postponed") return "POSTPONED";
  if (match.status === "cancelled") return "CANCELLED";
  return "UPCOMING";
};

const scoreMarkup = (match) => {
  const hasScore =
    match.status !== "scheduled" &&
    match.homeScore != null &&
    match.awayScore != null;
  if (!hasScore) return `<span class="lfc-versus">vs</span>`;
  return `<span class="lfc-score">${esc(match.homeScore)}–${esc(match.awayScore)}</span>`;
};

const matchCard = (match, featured = false) => {
  const live = LIVE_STATUSES.has(match.status);
  const classes = ["lfc-match", featured ? "lfc-match--featured" : "", live ? "lfc-match--live" : ""]
    .filter(Boolean)
    .join(" ");
  const body = `
    <div class="lfc-match-topline">
      <span class="lfc-competition">${esc(match.competition)}</span>
      <span class="lfc-status lfc-status--${esc(match.status)}">${esc(statusLabel(match))}</span>
    </div>
    <div class="lfc-teams">
      <span class="lfc-team${normalizeTeamName(match.homeTeam) === "liverpool" ? " lfc-team--liverpool" : ""}">${esc(match.homeTeam)}</span>
      ${scoreMarkup(match)}
      <span class="lfc-team lfc-team--away${normalizeTeamName(match.awayTeam) === "liverpool" ? " lfc-team--liverpool" : ""}">${esc(match.awayTeam)}</span>
    </div>
    <div class="lfc-match-meta">
      <span class="lfc-meta-item">${icon("calendar")}<time class="lfc-kickoff" datetime="${esc(match.kickoff)}">${esc(dateLabel(match.kickoff))}</time></span>
      ${match.venue ? `<span class="lfc-meta-item">${icon("pin")}<span>${esc(match.venue)}</span></span>` : ""}
      <span class="lfc-meta-item">${icon("source")}<span>${esc(match.source)}</span></span>
    </div>`;

  if (match.sourceUrl) {
    return `<a class="${classes}" href="${esc(match.sourceUrl)}" target="_blank" rel="noopener">${body}</a>`;
  }
  return `<article class="${classes}">${body}</article>`;
};

const section = (heading, matches, featuredFirst = false) => {
  if (matches.length === 0) return "";
  return `<section class="lfc-section"><h4>${sectionIcon(heading)}<span>${esc(heading)}</span></h4><div class="lfc-match-list">${matches
    .map((match, index) => matchCard(match, featuredFirst && index === 0))
    .join("")}</div></section>`;
};

const relativeAge = (timestamp, now) => {
  const minutes = Math.max(0, Math.floor((now.getTime() - timestamp) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
};

const renderContent = (data, intent, now = new Date()) => {
  if (!data.matches.length) {
    return `<div class="lfc-empty"><strong>Could not load Liverpool match data.</strong>${data.error ? `<span>${esc(data.error)}</span>` : ""}</div>`;
  }

  const nowMs = now.getTime();
  const live = data.matches.filter((match) => LIVE_STATUSES.has(match.status));
  const upcoming = data.matches
    .filter((match) => match.status === "scheduled" && new Date(match.kickoff).getTime() >= nowMs - 30 * 60 * 1000)
    .slice(0, maxUpcoming);
  const recent = data.matches
    .filter((match) => match.status === "finished")
    .sort((a, b) => new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime())
    .slice(0, 5);

  const sections = [];
  if (intent === "live") {
    if (live.length) sections.push(section("Live now", live, true));
    else if (upcoming.length) sections.push(section("No live match · Next fixture", upcoming.slice(0, 1), true));
  } else if (intent === "fixtures") {
    sections.push(section("Upcoming fixtures", upcoming, true));
  } else if (intent === "results") {
    sections.push(section("Recent results", recent, true));
  } else {
    if (live.length) sections.push(section("Live now", live, true));
    else if (upcoming.length) sections.push(section("Next match", upcoming.slice(0, 1), true));
    if (recent.length) sections.push(section("Last result", recent.slice(0, 1)));
    if (upcoming.length > 1) sections.push(section("Coming up", upcoming.slice(1)));
  }

  if (sections.length === 0) {
    sections.push(`<div class="lfc-empty"><strong>No matching fixtures found.</strong><span>Try again later or check the configured fixture feeds.</span></div>`);
  }

  const freshness = data.stale ? " · stale fallback" : "";
  const quota = data.apiRemaining != null ? ` · API quota ${esc(data.apiRemaining)}` : "";
  return `<div class="lfc-wrap">
    <header class="lfc-header"><span class="lfc-mark">${icon("ball", "lfc-mark-icon")}<span class="lfc-mark-text">LFC</span></span><div><strong>Liverpool FC</strong><span>Fixtures and scores</span></div></header>
    ${sections.join("")}
    <footer class="lfc-footer">Updated ${esc(relativeAge(data.fetchedAt, now))}${freshness}${quota}</footer>
  </div>`;
};

export const slot = {
  isClientExposed: false,
  id: "liverpool-matches",
  name: "Liverpool Matches",
  position: "above-results",
  description: "Shows Liverpool FC live scores, recent results, and upcoming fixtures.",

  settingsSchema: [
    {
      key: "apiFootballKey",
      label: "API-Football key",
      type: "password",
      secret: true,
      placeholder: "Optional free API key",
      description: "Recommended for supported live scores. Without a key, the plugin uses the experimental ESPN fallback.",
    },
    {
      key: "enableEspnFallback",
      label: "Enable ESPN fallback",
      type: "toggle",
      default: true,
      description: "Cross-check today's live score using ESPN's unsupported public JSON endpoints and use it as a fallback when API-Football is unavailable.",
    },
    {
      key: "normalCacheMinutes",
      label: "Normal cache duration (minutes)",
      type: "text",
      placeholder: "60",
      description: "Used away from kickoff. Live matches automatically use a shorter cache.",
    },
    {
      key: "maxUpcoming",
      label: "Upcoming fixtures to show",
      type: "text",
      placeholder: "5",
      description: "Between 1 and 10 fixtures.",
    },
    {
      key: "fixtureFeedUrls",
      label: "Custom FixtureDownload JSON feeds",
      type: "urllist",
      placeholder: "https://fixturedownload.com/feed/json/.../liverpool",
      description: "Optional. Leave empty to use the current Premier League and Champions League Liverpool feeds.",
    },
  ],

  init(ctx) {
    template = ctx.template;
  },

  configure(settings) {
    apiFootballKey = String(settings?.apiFootballKey || "").trim();
    enableEspnFallback = asBoolean(settings?.enableEspnFallback, true);
    normalCacheMinutes = boundedInt(settings?.normalCacheMinutes, 60, 10, 360);
    maxUpcoming = boundedInt(settings?.maxUpcoming, 5, 1, 10);
    customFixtureFeeds = parseUrlList(settings?.fixtureFeedUrls)
      .filter((url) => /^https:\/\//i.test(String(url)));
    cache.expiresAt = 0;
  },

  trigger(query) {
    return hasLiverpoolMatchIntent(query);
  },

  async execute(query, context) {
    const fetchFn = context?.fetch || fetch;
    const now = new Date();
    const data = await getMatchData(fetchFn, now);
    const content = renderContent(data, queryIntent(query), now);
    return {
      title: "Liverpool FC",
      html: template.replace(/\{\{content\}\}/g, content),
    };
  },
};

export const __testing = {
  cache,
  cacheTtl,
  getMatchData,
  renderContent,
  resetCache() {
    cache.value = null;
    cache.fetchedAt = 0;
    cache.expiresAt = 0;
    cache.staleUntil = 0;
  },
};

export default { slot };

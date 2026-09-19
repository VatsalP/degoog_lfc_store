import test from "node:test";
import assert from "node:assert/strict";

import {
  hasLiverpoolMatchIntent,
  mergeMatches,
  queryIntent,
  __testing,
} from "../plugins/liverpool-matches/index.js";
import { normalizeApiFootballFixture } from "../plugins/liverpool-matches/providers/api-football.js";
import { normalizeEspnEvent } from "../plugins/liverpool-matches/providers/espn.js";
import { normalizeFixtureDownloadMatch } from "../plugins/liverpool-matches/providers/fixture-download.js";

test("slot triggers only for Liverpool football intent", () => {
  for (const query of [
    "lfc",
    "Liverpool live score",
    "Liverpool next match",
    "Arsenal vs Liverpool",
    "when do Liverpool play?",
  ]) {
    assert.equal(hasLiverpoolMatchIntent(query), true, query);
  }

  for (const query of [
    "Liverpool weather",
    "hotels in Liverpool",
    "University of Liverpool",
    "Arsenal score",
  ]) {
    assert.equal(hasLiverpoolMatchIntent(query), false, query);
  }
});

test("query intent selects results and fixtures views", () => {
  assert.equal(queryIntent("Liverpool results"), "results");
  assert.equal(queryIntent("Liverpool next match"), "fixtures");
  assert.equal(queryIntent("Liverpool live"), "live");
  assert.equal(queryIntent("Liverpool score"), "summary");
});

test("normalizes API-Football fixtures", () => {
  const match = normalizeApiFootballFixture({
    fixture: {
      id: 42,
      date: "2026-09-19T15:00:00Z",
      status: { short: "2H", long: "Second Half", elapsed: 67 },
      venue: { name: "Anfield" },
    },
    league: { name: "Premier League", round: "Regular Season - 5" },
    teams: { home: { name: "Liverpool" }, away: { name: "Arsenal" } },
    goals: { home: 2, away: 1 },
  });

  assert.equal(match.status, "live");
  assert.equal(match.minute, 67);
  assert.equal(match.homeScore, 2);
  assert.equal(match.sourcePriority, 30);
});

test("normalizes ESPN schedule events", () => {
  const match = normalizeEspnEvent({
    id: "401",
    date: "2026-09-19T15:00Z",
    league: { abbreviation: "Premier League" },
    competitions: [{
      date: "2026-09-19T15:00Z",
      venue: { fullName: "Anfield" },
      status: {
        displayClock: "72'",
        type: { state: "in", completed: false, description: "In Progress" },
      },
      competitors: [
        { homeAway: "home", team: { id: "364", displayName: "Liverpool" }, score: { displayValue: "1" } },
        { homeAway: "away", team: { id: "359", displayName: "Arsenal" }, score: { displayValue: "0" } },
      ],
    }],
  }, "eng.1");

  assert.equal(match.status, "live");
  assert.equal(match.minute, 72);
  assert.equal(match.homeTeam, "Liverpool");
  assert.equal(match.awayScore, 0);
});

test("normalizes FixtureDownload records without treating them as live", () => {
  const scheduled = normalizeFixtureDownloadMatch({
    MatchNumber: 1,
    RoundNumber: 2,
    DateUtc: "2026-09-20 13:00:00Z",
    Location: "Anfield",
    HomeTeam: "Liverpool",
    AwayTeam: "Chelsea",
    HomeTeamScore: null,
    AwayTeamScore: null,
  }, "Premier League");
  assert.equal(scheduled.status, "scheduled");
  assert.equal(scheduled.kickoff, "2026-09-20T13:00:00Z");

  const finished = normalizeFixtureDownloadMatch({
    MatchNumber: 1,
    RoundNumber: 2,
    DateUtc: "2026-09-20 13:00:00Z",
    Location: "Anfield",
    HomeTeam: "Liverpool",
    AwayTeam: "Chelsea",
    HomeTeamScore: 3,
    AwayTeamScore: 1,
  }, "Premier League");
  assert.equal(finished.status, "finished");
  assert.equal(finished.kickoff, "2026-09-20T13:00:00Z");
  assert.equal(finished.homeScore, 3);
});

test("higher-priority source wins when providers describe the same match", () => {
  const base = {
    kickoff: "2026-09-20T13:00:00Z",
    homeTeam: "Liverpool FC",
    awayTeam: "Chelsea",
    status: "scheduled",
  };
  const matches = mergeMatches([
    [{ ...base, id: "fixture", source: "FixtureDownload", sourcePriority: 10 }],
    [{ ...base, homeTeam: "Liverpool", id: "api", source: "API-Football", sourcePriority: 30 }],
  ]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "api");
});

test("cache TTL becomes shorter near kickoff and during live play", () => {
  const now = new Date("2026-09-19T12:00:00Z");
  const far = [{ kickoff: "2026-09-21T12:00:00Z", status: "scheduled" }];
  const near = [{ kickoff: "2026-09-19T13:00:00Z", status: "scheduled" }];
  const live = [{ kickoff: "2026-09-19T11:00:00Z", status: "live" }];

  assert.equal(__testing.cacheTtl(far, now), 60 * 60 * 1000);
  assert.equal(__testing.cacheTtl(near, now), 10 * 60 * 1000);
  assert.equal(__testing.cacheTtl(live, now), 2 * 60 * 1000);
});

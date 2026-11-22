/**
 * Stats — trial record shapes, aggregation into the report model, the
 * target-vs-observed band report, and the tuning-loop win-rate bands
 * (spec §6: "prints a band report (target vs observed)").
 *
 * Pure computation over `GameRecord`s produced by `runner.ts`; the design
 * doc's Open Questions validation checklist supplies the band targets
 * (30–40% baseline win rate, Apollo hardware by ~turn 27).
 */

import type { Content, GameResult, Move } from '../engine';

/** Resources sampled at each year boundary (mean resources per year, spec §6). */
export interface YearSnapshot {
  year: number;
  money: number;
  rd: number;
}

/** Everything extracted from one finished game (aggregation input). */
export interface GameRecord {
  seed: string;
  policy: string;
  result: GameResult;
  vp: number;
  tier: string;
  turn: number;
  apollo11Turn: number | null;
  sovietLandingTurn: number | null;
  apolloHardwareTurn: number | null;
  /** failCount per ladder mission at game end (FR5.1 retry accounting). */
  missionFails: number[];
  /** Whether each ladder mission was attempted (done, active, or failed). */
  missionReached: boolean[];
  sideMissions: Record<string, { flown: boolean; fails: number }>;
  milestoneVpBites: number;
  milestoneMoneyBites: number;
  resourcesByYear: YearSnapshot[];
  moveCount: number;
}

/** A game that could not finish — replayable bug capture (spec §6). */
export interface Anomaly {
  seed: string;
  moves: Move[];
  error: string;
}

/** Run provenance printed atop the report. */
export interface RunMeta {
  policy: string;
  games: number;
  seed: string;
  workers: number;
  elapsedMs: number;
  gamesPerSecond: number;
}

/** One target-vs-observed line of the band report. */
export interface Band {
  label: string;
  target: string;
  observed: string;
  pass: boolean;
}

export interface ScoreSummary {
  mean: number;
  min: number;
  max: number;
  p10: number;
  p50: number;
  p90: number;
  histogram: { label: string; count: number }[];
}

export interface TurnSummary {
  games: number;
  mean: number;
  p90: number;
  /** Counts indexed by turn 1–30. */
  histogram: number[];
}

export interface Stats {
  meta: RunMeta;
  results: Record<GameResult, number>;
  winRate: number;
  tiers: Record<string, number>;
  scores: ScoreSummary;
  scoresByResult: Record<GameResult, { mean: number; p50: number; p90: number }>;
  missions: { index: number; id: string; name: string; reached: number; fails: number; failRate: number; retryRate: number }[];
  sideMissions: { id: string; name: string; flown: number; fails: number; failRate: number }[];
  apollo11Turns: TurnSummary;
  sovietLandingTurns: TurnSummary;
  apolloHardwareTurn: { games: number; coverage: number; mean: number; p90: number };
  resourcesByYear: { year: number; meanMoney: number; meanRd: number }[];
  milestoneBites: { meanVp: number; meanMoney: number };
  anomalies: Anomaly[];
  records: GameRecord[];
}

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Nearest-rank percentile over an unsorted sample (0 when empty). */
function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function turnSummary(turns: readonly number[]): TurnSummary {
  const histogram = Array.from({ length: 31 }, () => 0);
  for (const turn of turns) histogram[turn] = (histogram[turn] ?? 0) + 1;
  return { games: turns.length, mean: mean(turns), p90: percentile(turns, 0.9), histogram };
}

function scoreHistogram(values: readonly number[]): { label: string; count: number }[] {
  const buckets = new Map<string, number>();
  for (const v of values) {
    const label = v < 0 ? '<0' : v >= 90 ? '90+' : `${Math.floor(v / 10) * 10}–${Math.floor(v / 10) * 10 + 9}`;
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }
  const labels = ['<0', ...Array.from({ length: 9 }, (_, i) => `${i * 10}–${i * 10 + 9}`), '90+'];
  return labels.map((label) => ({ label, count: buckets.get(label) ?? 0 }));
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregates finished-game records into the full report model (spec §6 stats
 * list: result/tier distributions, score histogram, per-mission failure and
 * retry rates, Soviet-landing and Apollo-11 turn histograms, mean resources
 * per year, milestone-bite totals).
 *
 * @param records - one entry per completed game.
 * @param anomalies - games that threw (never completed).
 * @param meta - run provenance.
 * @param content - content bundle used for mission/side-mission labels.
 */
export function aggregate(
  records: readonly GameRecord[],
  anomalies: readonly Anomaly[],
  meta: RunMeta,
  content: Content,
): Stats {
  const results: Record<GameResult, number> = { moon: 0, timedOut: 0, sovietsWon: 0 };
  const tiers: Record<string, number> = {};
  for (const record of records) {
    results[record.result]++;
    tiers[record.tier] = (tiers[record.tier] ?? 0) + 1;
  }

  const scores = records.map((r) => r.vp);
  const scoresByResult = {} as Stats['scoresByResult'];
  for (const result of ['moon', 'timedOut', 'sovietsWon'] as GameResult[]) {
    const sample = records.filter((r) => r.result === result).map((r) => r.vp);
    scoresByResult[result] = {
      mean: mean(sample),
      p50: percentile(sample, 0.5),
      p90: percentile(sample, 0.9),
    };
  }

  const missions = content.missions.map((mission, index) => {
    const reached = records.filter((r) => r.missionReached[index]).length;
    const fails = records.reduce((sum, r) => sum + (r.missionFails[index] ?? 0), 0);
    const retried = records.filter((r) => (r.missionFails[index] ?? 0) > 0).length;
    return {
      index,
      id: mission.id,
      name: mission.name,
      reached,
      fails,
      failRate: reached === 0 ? 0 : fails / reached,
      retryRate: reached === 0 ? 0 : retried / reached,
    };
  });

  const sideMissions = content.cards
    .filter((card) => card.kind === 'sideMission' && card.sideMission)
    .map((card) => {
      let flown = 0;
      let fails = 0;
      for (const record of records) {
        const entry = record.sideMissions[card.id];
        if (!entry) continue;
        if (entry.flown) flown++;
        fails += entry.fails;
      }
      const tries = flown + fails;
      return { id: card.id, name: card.sideMission!.name, flown, fails, failRate: tries === 0 ? 0 : fails / tries };
    });

  const apolloHardware = records
    .map((r) => r.apolloHardwareTurn)
    .filter((turn): turn is number => turn !== null);

  const resourcesByYear: Stats['resourcesByYear'] = [];
  for (let year = 1960; year <= 1969; year++) {
    const samples = records.map((r) => r.resourcesByYear.find((s) => s.year === year)).filter((s) => s !== undefined);
    if (samples.length === 0) continue;
    resourcesByYear.push({
      year,
      meanMoney: mean(samples.map((s) => s!.money)),
      meanRd: mean(samples.map((s) => s!.rd)),
    });
  }

  return {
    meta,
    results,
    winRate: records.length === 0 ? 0 : results.moon / records.length,
    tiers,
    scores: {
      mean: mean(scores),
      min: scores.length === 0 ? 0 : Math.min(...scores),
      max: scores.length === 0 ? 0 : Math.max(...scores),
      p10: percentile(scores, 0.1),
      p50: percentile(scores, 0.5),
      p90: percentile(scores, 0.9),
      histogram: scoreHistogram(scores),
    },
    scoresByResult,
    missions,
    sideMissions,
    apollo11Turns: turnSummary(records.filter((r) => r.apollo11Turn !== null).map((r) => r.apollo11Turn!)),
    sovietLandingTurns: turnSummary(records.filter((r) => r.sovietLandingTurn !== null).map((r) => r.sovietLandingTurn!)),
    apolloHardwareTurn: {
      games: apolloHardware.length,
      coverage: records.length === 0 ? 0 : apolloHardware.length / records.length,
      mean: mean(apolloHardware),
      p90: percentile(apolloHardware, 0.9),
    },
    resourcesByYear,
    milestoneBites: {
      meanVp: mean(records.map((r) => r.milestoneVpBites)),
      meanMoney: mean(records.map((r) => r.milestoneMoneyBites)),
    },
    anomalies: [...anomalies],
    records: [...records],
  };
}

// ---------------------------------------------------------------------------
// Bands (target vs observed) — the design doc's validation checklist
// ---------------------------------------------------------------------------

/**
 * Win-rate bands per policy (spec §6: the 30–40% target must hold for
 * baseline without exceeding ~60% for aggressive). Conservative is the low
 * bracket and carries no band — it only bounds the spread.
 */
const WIN_BANDS: Record<string, [number, number] | null> = {
  baseline: [0.3, 0.4],
  aggressive: [0, 0.6],
  conservative: null,
};

/** Apollo hardware must be finishable by ~turn 27 (economy validation). */
const APOLLO_HARDWARE_TURN = 27.5;

/** Evaluates the target-vs-observed band report for one run. */
export function evaluateBands(stats: Stats): Band[] {
  const bands: Band[] = [];
  const winBand = WIN_BANDS[stats.meta.policy];
  if (winBand) {
    const [low, high] = winBand;
    bands.push({
      label: `${stats.meta.policy} win rate`,
      target: `${Math.round(low * 100)}–${Math.round(high * 100)}%`,
      observed: `${(stats.winRate * 100).toFixed(1)}%`,
      pass: stats.winRate >= low && stats.winRate <= high,
    });
  }
  if (stats.meta.policy === 'baseline') {
    bands.push({
      label: 'Apollo hardware complete by ~turn 27',
      target: `≤ ${APOLLO_HARDWARE_TURN}`,
      observed: stats.apolloHardwareTurn.games === 0 ? 'never' : stats.apolloHardwareTurn.mean.toFixed(1),
      pass: stats.apolloHardwareTurn.games > 0 && stats.apolloHardwareTurn.mean <= APOLLO_HARDWARE_TURN,
    });
  }
  return bands;
}

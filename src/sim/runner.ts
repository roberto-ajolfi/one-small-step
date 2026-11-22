/**
 * Runner — Monte Carlo trials over the engine (spec §6): `runTrials()` plays
 * seeded games under a policy, extracts one `GameRecord` per game, and fans
 * the work out over a `worker_threads` pool (≥1,000 games/s aggregate,
 * spec §10). Every game that throws is captured as a replayable
 * `{seed, moves[]}` anomaly dumped into `tests/integration/fixtures/`
 * (spec §6) so it can be turned straight into a regression test.
 *
 * I/O lives here (the harness is an edge, §8.1) — the engine stays pure.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { apply, legalMoves, newGame, scoreGame, type Content, type Tuning } from '../engine';
import { loadContent } from '../data';
import { getPolicy, type Policy, type PolicyName } from './policy';
import { aggregate, type Anomaly, type GameRecord, type RunMeta, type Stats, type YearSnapshot } from './stats';

/** Safety valve: no legal game anywhere near this many moves (spec §4.4). */
const MAX_MOVES = 10_000;

/** Cap on anomaly fixture files per run — enough to debug, not enough to flood. */
const MAX_ANOMALY_DUMPS = 20;

/** Options for one harness run (spec §6 runTrials signature). */
export interface TrialOptions {
  games: number;
  seed: string;
  /** Shipped policy name, or a custom policy (custom policies run in-process). */
  policy: PolicyName | Policy;
  /** Tuning override (parsed via `tuningSchema` by the caller); never mutated. */
  tuning?: Tuning;
  /** Thread count; 1 runs in-process (tests), defaults to cores − 1. */
  workers?: number;
  /** Where anomaly fixtures are dumped (default `tests/integration/fixtures`). */
  anomalyDir?: string;
}

/** Game seed derivation: game `i` of a run is `${seed}#${i}` (shareable). */
export function seedFor(seed: string, index: number): string {
  return `${seed}#${index}`;
}

/** Builds a fresh content bundle for one run (never mutates shared content). */
export function contentWithTuning(tuning?: Tuning): Content {
  const base = loadContent();
  return tuning ? { ...base, tuning } : base;
}

function recordOf(
  state: ReturnType<typeof newGame>,
  seed: string,
  policyName: string,
  apolloHardwareTurn: number | null,
  resourcesByYear: YearSnapshot[],
): GameRecord {
  const score = scoreGame(state);
  const t = state.content.tuning;
  return {
    seed,
    policy: policyName,
    result: state.result!,
    vp: score.vp,
    tier: score.tier,
    turn: state.turn,
    apollo11Turn: state.result === 'moon' ? state.turn : null,
    sovietLandingTurn: state.result === 'sovietsWon' ? state.turn : null,
    apolloHardwareTurn,
    missionFails: state.campaign.status.map((s) => s.failCount),
    missionReached: state.campaign.status.map(
      (s, i) => i < state.campaign.index || s.failCount > 0 || s.state === 'active',
    ),
    sideMissions: Object.fromEntries(
      Object.entries(state.sideMissions).map(([id, s]) => [id, { flown: s.status === 'flown', fails: s.fails }]),
    ),
    milestoneVpBites: state.vp.penaltyMilestones,
    milestoneMoneyBites: Math.floor(state.soviet.maxPosition / t.moneyBiteEvery),
    resourcesByYear: [...resourcesByYear],
    moveCount: state.moves.length,
  };
}

/**
 * Plays one game to a terminal state under `policy`.
 *
 * @returns the extracted record, or a replayable anomaly when anything throws
 *   (IllegalMove from a policy bug, engine invariant, move-budget overrun).
 */
export function playTrial(
  seed: string,
  content: Content,
  policy: Policy,
): { record?: GameRecord; anomaly?: Anomaly } {
  const apolloNeeds = content.missions[content.missions.length - 1].requires;
  const resourcesByYear: YearSnapshot[] = [];
  let state = newGame(seed, content);
  let apolloHardwareTurn: number | null = null;
  let lastYear = -1;
  try {
    while (state.phase !== 'gameOver') {
      if (state.moves.length >= MAX_MOVES) throw new Error(`move budget exceeded (${MAX_MOVES} moves)`);
      state = apply(state, policy.choose(state, legalMoves(state)));
      if (apolloHardwareTurn === null && apolloNeeds.every((tech) => state.tech[tech])) {
        apolloHardwareTurn = state.turn;
      }
      if (state.year !== lastYear) {
        lastYear = state.year;
        resourcesByYear.push({ year: state.year, money: state.resources.money, rd: state.resources.rd });
      }
    }
    return { record: recordOf(state, seed, policy.name, apolloHardwareTurn, resourcesByYear) };
  } catch (error) {
    return {
      anomaly: {
        seed,
        moves: [...state.moves],
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      },
    };
  }
}

/** Plays `count` games with global indices `[from, from + count)` (sync batch). */
export function playRange(
  from: number,
  count: number,
  seed: string,
  content: Content,
  policy: Policy,
): { records: GameRecord[]; anomalies: Anomaly[] } {
  const records: GameRecord[] = [];
  const anomalies: Anomaly[] = [];
  for (let i = from; i < from + count; i++) {
    const outcome = playTrial(seedFor(seed, i), content, policy);
    if (outcome.record) records.push(outcome.record);
    else if (outcome.anomaly) anomalies.push(outcome.anomaly);
  }
  return { records, anomalies };
}

/** Writes one anomaly as a `{seed, moves[]}` replay fixture (spec §6). */
export function dumpAnomaly(anomaly: Anomaly, dir: string): string {
  mkdirSync(dir, { recursive: true });
  const safe = anomaly.seed.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const file = join(dir, `anomaly-${safe}.json`);
  writeFileSync(file, `${JSON.stringify(anomaly, null, 2)}\n`);
  return file;
}

function runWorker(
  from: number,
  count: number,
  options: TrialOptions,
  content: Content,
  policyName: string,
): Promise<{ records: GameRecord[]; anomalies: Anomaly[] }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), {
      workerData: { from, count, seed: options.seed, policy: policyName, tuning: content.tuning },
    });
    worker.once('message', (payload) => {
      void worker.terminate();
      resolve(payload as { records: GameRecord[]; anomalies: Anomaly[] });
    });
    worker.once('error', reject);
  });
}

/**
 * Runs the trial batch and aggregates the report model (spec §6).
 *
 * @param options - games/seed/policy/tuning/workers/anomalyDir.
 * @returns full stats incl. records, anomalies and throughput.
 * @throws when the policy name is unknown (fail fast before any work).
 */
export async function runTrials(options: TrialOptions): Promise<Stats> {
  const policy = typeof options.policy === 'string' ? getPolicy(options.policy) : options.policy;
  const content = contentWithTuning(options.tuning);
  // Custom policy objects can't cross the worker boundary — run them here.
  const workers =
    typeof options.policy === 'string'
      ? Math.max(1, options.workers ?? Math.max(1, availableParallelism() - 1))
      : 1;

  const started = Date.now();
  let records: GameRecord[];
  let anomalies: Anomaly[];

  if (workers <= 1) {
    ({ records, anomalies } = playRange(0, options.games, options.seed, content, policy));
  } else {
    const perWorker = Math.ceil(options.games / workers);
    const runs = await Promise.all(
      Array.from({ length: workers }, (_, w) => {
        const from = w * perWorker;
        const count = Math.min(perWorker, options.games - from);
        return count > 0 ? runWorker(from, count, options, content, policy.name) : null;
      }),
    );
    records = [];
    anomalies = [];
    for (const run of runs) {
      if (!run) continue;
      records.push(...run.records);
      anomalies.push(...run.anomalies);
    }
    records.sort((a, b) => a.seed.localeCompare(b.seed));
    anomalies.sort((a, b) => a.seed.localeCompare(b.seed));
  }

  const elapsedMs = Date.now() - started;
  const dir = options.anomalyDir ?? 'tests/integration/fixtures';
  for (const anomaly of anomalies.slice(0, MAX_ANOMALY_DUMPS)) dumpAnomaly(anomaly, dir);

  const meta: RunMeta = {
    policy: policy.name,
    games: options.games,
    seed: options.seed,
    workers,
    elapsedMs,
    gamesPerSecond: elapsedMs === 0 ? options.games : options.games / (elapsedMs / 1000),
  };
  return aggregate(records, anomalies, meta, content);
}

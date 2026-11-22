/**
 * Sim CLI — the tuning loop's entry point (spec §6):
 *   npm run sim -- --games 10000 --policy baseline --tuning overrides.json
 *
 * Prints the band report (target vs observed) and exits non-zero when a
 * win-rate band is missed, so a tuned game can be regression-checked in CI.
 * I/O and argv handling live here; everything else is pure (spec §8.1).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseOrThrow, loadTuning, tuningSchema } from '../data';
import type { Tuning } from '../engine';
import { policies, type PolicyName } from './policy';
import { renderReport } from './report';
import { runTrials } from './runner';
import { evaluateBands, type Band, type Stats } from './stats';

/** Parsed CLI configuration (exported for tests — pure). */
export interface CliConfig {
  games: number;
  seed: string;
  policy: PolicyName | 'all';
  tuningFile?: string;
  workers?: number;
  /** Exit non-zero when bands are missed (default; `--no-check` opts out). */
  check: boolean;
  /** Optional path for the full stats JSON dump. */
  jsonFile?: string;
}

const USAGE = `usage: npm run sim -- [options]
  --games N       games per policy (default 1000)
  --seed S        seed base; game i plays as "S#i" (default "sim")
  --policy NAME   baseline | aggressive | conservative | all (default baseline)
  --tuning FILE   JSON file of tuning overrides merged over tuning.json
  --workers N     worker threads (default cores − 1; 1 = in-process)
  --json FILE     also write the full stats as JSON
  --no-check      report only; never fail the exit code on missed bands`;

function fail(message: string): never {
  throw new Error(`${message}\n${USAGE}`);
}

/** Parses argv (without the node/script prefix); throws with usage on errors. */
export function parseArgs(argv: readonly string[]): CliConfig {
  const config: CliConfig = {
    games: 1000,
    seed: 'sim',
    policy: 'baseline',
    check: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) fail(`missing value for ${arg}`);
      return next;
    };
    switch (arg) {
      case '--games': {
        const games = Number(value());
        if (!Number.isInteger(games) || games <= 0) fail('--games needs a positive integer');
        config.games = games;
        break;
      }
      case '--seed':
        config.seed = value();
        break;
      case '--policy': {
        const policy = value();
        if (policy !== 'all' && !(policy in policies)) {
          fail(`unknown policy: ${policy} (expected ${Object.keys(policies).join(', ')}, or all)`);
        }
        config.policy = policy as CliConfig['policy'];
        break;
      }
      case '--tuning':
        config.tuningFile = value();
        break;
      case '--workers': {
        const workers = Number(value());
        if (!Number.isInteger(workers) || workers <= 0) fail('--workers needs a positive integer');
        config.workers = workers;
        break;
      }
      case '--json':
        config.jsonFile = value();
        break;
      case '--no-check':
        config.check = false;
        break;
      default:
        fail(`unknown option: ${arg}`);
    }
  }
  return config;
}

/**
 * Loads the `--tuning` override file: shallow-merged over a fresh copy of
 * `tuning.json` and validated as a whole (spec §6; nested objects must be
 * given complete). Returns undefined when no override file is configured.
 */
export function loadTuningOverride(file: string): Tuning {
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    fail(`tuning override must be a JSON object: ${file}`);
  }
  return parseOrThrow(tuningSchema, { ...loadTuning(), ...raw }, file);
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const tuning = config.tuningFile ? loadTuningOverride(config.tuningFile) : undefined;
  const names: PolicyName[] =
    config.policy === 'all' ? (Object.keys(policies) as PolicyName[]) : [config.policy];

  const reports: { stats: Stats; bands: Band[] }[] = [];
  for (const name of names) {
    const stats = await runTrials({
      games: config.games,
      seed: config.seed,
      policy: name,
      tuning,
      workers: config.workers,
    });
    const bands = evaluateBands(stats);
    reports.push({ stats, bands });
    console.log(`${renderReport(stats, bands)}\n`);
  }

  if (names.length > 1) {
    const best = reports.reduce((a, b) => (b.stats.winRate > a.stats.winRate ? b : a));
    console.log(`Skilled win rate (best policy): ${best.stats.meta.policy} ${(best.stats.winRate * 100).toFixed(1)}%`);
  }

  if (config.jsonFile) {
    writeFileSync(config.jsonFile, `${JSON.stringify(reports.map((r) => r.stats), null, 2)}\n`);
    console.log(`Stats JSON written to ${config.jsonFile}`);
  }

  const missed = reports.flatMap((r) => r.bands.filter((b) => !b.pass));
  if (config.check && missed.length > 0) {
    for (const band of missed) console.error(`MISSED BAND: ${band.label} — target ${band.target}, observed ${band.observed}`);
    process.exitCode = 1;
  }
}

// Entry point only when executed directly (tests import the parsing helpers).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

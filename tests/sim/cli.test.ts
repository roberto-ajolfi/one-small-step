/**
 * CLI tests — pure argv parsing and the `--tuning` override merge (spec §6:
 * `npm run sim -- --games 10000 --policy baseline --tuning overrides.json`).
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadTuning } from '../../src/data';
import { loadTuningOverride, parseArgs } from '../../src/sim/cli';

describe('parseArgs', () => {
  it('defaults to the tuning-loop smoke run', () => {
    expect(parseArgs([])).toEqual({
      games: 1000,
      seed: 'sim',
      policy: 'baseline',
      check: true,
    });
  });

  it('parses every documented flag', () => {
    const config = parseArgs([
      '--games', '10000',
      '--seed', 'release-1',
      '--policy', 'all',
      '--tuning', 'overrides.json',
      '--workers', '4',
      '--json', 'stats.json',
      '--no-check',
    ]);
    expect(config).toEqual({
      games: 10000,
      seed: 'release-1',
      policy: 'all',
      tuningFile: 'overrides.json',
      workers: 4,
      jsonFile: 'stats.json',
      check: false,
    });
  });

  it('rejects bad values with a usage error', () => {
    expect(() => parseArgs(['--games', '0'])).toThrow(/positive integer/);
    expect(() => parseArgs(['--games', 'x'])).toThrow(/positive integer/);
    expect(() => parseArgs(['--workers', '-1'])).toThrow(/positive integer/);
    expect(() => parseArgs(['--policy', 'speedrun'])).toThrow(/unknown policy/);
    expect(() => parseArgs(['--seed'])).toThrow(/missing value/);
    expect(() => parseArgs(['--nope'])).toThrow(/unknown option/);
  });
});

describe('loadTuningOverride', () => {
  const overrideDir = mkdtempSync(join(tmpdir(), 'sim-tuning-'));
  const write = (name: string, json: unknown): string => {
    const file = join(overrideDir, name);
    writeFileSync(file, JSON.stringify(json));
    return file;
  };

  it('merges a partial override over a fresh tuning.json copy', () => {
    const file = write('partial.json', { sovietDrift: 2, startingMoney: 10 });
    const tuning = loadTuningOverride(file);
    expect(tuning.sovietDrift).toBe(2);
    expect(tuning.startingMoney).toBe(10);
    expect(tuning.sovietTrackLength).toBe(loadTuning().sovietTrackLength); // rest inherited
    expect(loadTuning().sovietDrift).toBe(1); // shipped file untouched
  });

  it('fails fast on unknown keys and non-object files', () => {
    expect(() => loadTuningOverride(write('typo.json', { sovietDift: 2 }))).toThrow(/sovietDift/);
    expect(() => loadTuningOverride(write('array.json', [1, 2]))).toThrow(/JSON object/);
  });
});

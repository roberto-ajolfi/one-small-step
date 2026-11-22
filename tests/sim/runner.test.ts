/**
 * Runner tests — seeded trials, determinism, tuning overrides and anomaly
 * capture (spec §6: `{seed, moves[]}` dumps into `tests/integration/fixtures/`).
 */

import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { content, loadTuning } from '../../src/data';
import { playTrial, policies, runTrials, seedFor, type Policy, type PolicyName } from '../../src/sim';

describe('runTrials (spec §6)', () => {
  it('produces one record per game with coherent stats', async () => {
    const stats = await runTrials({ games: 4, seed: 'runner', policy: 'baseline', workers: 1 });
    expect(stats.records).toHaveLength(4);
    expect(stats.anomalies).toHaveLength(0);
    expect(stats.meta.games).toBe(4);
    expect(stats.meta.gamesPerSecond).toBeGreaterThan(0);
    const counted = stats.results.moon + stats.results.timedOut + stats.results.sovietsWon;
    expect(counted).toBe(4);
    for (const record of stats.records) {
      expect(record.seed).toMatch(/^runner#\d+$/);
      expect(record.missionReached).toHaveLength(content.missions.length);
    }
  });

  it('is deterministic: same seed base ⇒ identical records (NFR2)', async () => {
    const a = await runTrials({ games: 5, seed: 'same', policy: 'baseline', workers: 1 });
    const b = await runTrials({ games: 5, seed: 'same', policy: 'baseline', workers: 1 });
    expect(JSON.stringify(a.records)).toBe(JSON.stringify(b.records));
  });

  it('different seed bases produce different games', async () => {
    const a = await runTrials({ games: 3, seed: 'one', policy: 'baseline', workers: 1 });
    const b = await runTrials({ games: 3, seed: 'two', policy: 'baseline', workers: 1 });
    expect(JSON.stringify(a.records)).not.toBe(JSON.stringify(b.records));
  });

  it('applies tuning overrides without mutating the shared content bundle', async () => {
    const tuning = { ...loadTuning(), startingMoney: 42 };
    const stats = await runTrials({ games: 2, seed: 'tune', policy: 'baseline', tuning, workers: 1 });
    for (const record of stats.records) {
      expect(record.resourcesByYear[0].money).toBeGreaterThanOrEqual(42);
    }
    expect(content.tuning.startingMoney).toBe(0); // shared bundle untouched
    expect(loadTuning().startingMoney).toBe(0); // fresh copies stay pristine
  });

  it('rejects unknown policy names before doing any work', async () => {
    await expect(
      runTrials({ games: 1, seed: 'x', policy: 'nope' as PolicyName, workers: 1 }),
    ).rejects.toThrow(/unknown policy/);
  });
});

describe('seed derivation', () => {
  it('games are addressable as seed#i (shareable bug reports)', () => {
    expect(seedFor('abc', 7)).toBe('abc#7');
    const { record } = playTrial(seedFor('abc', 7), content, policies.baseline);
    expect(record!.seed).toBe('abc#7');
  });
});

describe('anomaly capture (spec §6)', () => {
  /** A policy that breaks the move contract: endTurn is illegal in 'draw'. */
  const broken: Policy = {
    name: 'broken',
    choose: () => ({ t: 'endTurn' }),
  };

  it('dumps failing games as replayable {seed, moves} fixtures', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sim-anomaly-'));
    const stats = await runTrials({
      games: 3,
      seed: 'boom',
      policy: broken,
      workers: 1,
      anomalyDir: dir,
    });
    expect(stats.records).toHaveLength(0);
    expect(stats.anomalies).toHaveLength(3);
    expect(stats.anomalies[0].error).toMatch(/IllegalMove/);

    const files = readdirSync(dir).sort();
    expect(files).toEqual(['anomaly-boom_0.json', 'anomaly-boom_1.json', 'anomaly-boom_2.json']);
    const dump = JSON.parse(readFileSync(join(dir, files[0]), 'utf8'));
    expect(dump.seed).toBe('boom#0');
    expect(Array.isArray(dump.moves)).toBe(true);
    expect(dump.moves).toHaveLength(0); // failed before anything was journaled
    expect(dump.error).toMatch(/action phase/);
  });
});

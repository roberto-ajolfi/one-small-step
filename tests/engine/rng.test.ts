/**
 * Seeded PRNG tests — determinism is the backbone of NFR2: same seed, same
 * stream; different seeds diverge; all outputs stay in range.
 */

import { describe, expect, it } from 'vitest';
import { createRng, randomFloat, randomInt, shuffle } from '../../src/engine';

describe('rng', () => {
  it('produces identical streams for identical seeds', () => {
    expect(sequence(createRng('alpha'), 50)).toEqual(sequence(createRng('alpha'), 50));
  });

  it('diverges for different seeds', () => {
    expect(sequence(createRng('alpha'), 10)).not.toEqual(sequence(createRng('beta'), 10));
  });

  it('stays within [0, 1)', () => {
    for (const value of sequence(createRng('range'), 500)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('randomInt stays within bounds and eventually hits every face', () => {
    let state = createRng('faces');
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const step = randomInt(state, 6);
      expect(step.value).toBeGreaterThanOrEqual(0);
      expect(step.value).toBeLessThan(6);
      seen.add(step.value);
      state = step.state;
    }
    expect(seen.size).toBe(6);
  });

  it('shuffle is deterministic and a true permutation', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const s1 = shuffle(createRng('shuffle'), items);
    const s2 = shuffle(createRng('shuffle'), items);
    expect(s1.value).toEqual(s2.value);
    expect([...s1.value].sort((a, b) => a - b)).toEqual(items);
    expect(shuffle(createRng('other'), items).value).not.toEqual(s1.value);
  });

  /** Consumes n floats from a fresh stream for comparison. */
  function sequence(state: ReturnType<typeof createRng>, n: number): number[] {
    const out: number[] = [];
    let s = state;
    for (let i = 0; i < n; i++) {
      const step = randomFloat(s);
      out.push(step.value);
      s = step.state;
    }
    return out;
  }
});

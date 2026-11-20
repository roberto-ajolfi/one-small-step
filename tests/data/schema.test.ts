/**
 * Schema tests (spec §5): the five shipped files validate at import, and the
 * schemas fail fast on malformed content with row-level messages — the guard a
 * designer hits when editing `src/data/*.json` by hand.
 */

import { describe, expect, it } from 'vitest';
import {
  cardsSchema,
  content,
  eventsSchema,
  loadTuning,
  missionsSchema,
  parseOrThrow,
  techTreeSchema,
  tuningSchema,
} from '../../src/data';
import cardsJson from '../../src/data/cards.json';
import eventsJson from '../../src/data/events.json';
import missionsJson from '../../src/data/missions.json';
import techTreeJson from '../../src/data/tech-tree.json';
import tuningJson from '../../src/data/tuning.json';

/** Deep copy through JSON so tests can corrupt a fixture without typing fights. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('shipped content files', () => {
  it('validate against every schema (import fails fast otherwise)', () => {
    expect(cardsSchema.safeParse(cardsJson).success).toBe(true);
    expect(missionsSchema.safeParse(missionsJson).success).toBe(true);
    expect(techTreeSchema.safeParse(techTreeJson).success).toBe(true);
    expect(eventsSchema.safeParse(eventsJson).success).toBe(true);
    expect(tuningSchema.safeParse(tuningJson).success).toBe(true);
    expect(content.cards).toHaveLength(54); // the `content` import parsed all five
  });

  it('loadTuning() hands out independent copies (harness --tuning overrides)', () => {
    const first = loadTuning();
    const second = loadTuning();
    first.sovietDrift = 5;
    expect(second.sovietDrift).toBe(1);
    expect(content.tuning.sovietDrift).toBe(1);
  });
});

describe('fail-fast rejection (spec §5 row-level messages)', () => {
  it('names the row and field when a card value has the wrong type', () => {
    const bad = clone(cardsJson) as unknown as Record<string, unknown>[];
    bad[13].s = 'nine';
    const result = cardsSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].path).toEqual([13, 's']);
    expect(() => parseOrThrow(cardsSchema, bad, 'cards')).toThrowError(/cards\[13\]\.s/);
  });

  it('rejects a typo\'d key on a card row (strict objects)', () => {
    const bad = clone(cardsJson) as unknown as Record<string, unknown>[];
    bad[0].flavour = 'misspelled';
    const result = cardsSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].path).toEqual([0]);
    expect(result.error.issues[0].message).toContain('flavour');
  });

  it('rejects a deck of the wrong length (54 rows, FR1.1)', () => {
    const bad = clone(cardsJson) as unknown[];
    bad.pop();
    expect(cardsSchema.safeParse(bad).success).toBe(false);
    expect(() => parseOrThrow(cardsSchema, bad, 'cards')).toThrowError(/54/);
  });

  it('rejects a mission chain naming an unknown phase', () => {
    const bad = clone(missionsJson) as unknown as { chain: unknown[] }[];
    bad[0].chain[1] = 'Launchpad';
    const result = missionsSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].path).toEqual([0, 'chain', 1]);
  });

  it('rejects a tech tree missing an item (11 rows, FR4.2)', () => {
    const bad = clone(techTreeJson) as unknown[];
    bad.pop();
    expect(techTreeSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an event face outside the d6 table (FR9.1)', () => {
    const bad = clone(eventsJson) as unknown as Record<string, unknown>[];
    bad[0].face = 7;
    const result = eventsSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].path).toEqual([0, 'face']);
  });

  it('rejects tuning with a missing constant (spec §5)', () => {
    const bad = clone(tuningJson) as Record<string, unknown>;
    delete bad.sovietDrift;
    const result = tuningSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].path).toEqual(['sovietDrift']);
  });
});

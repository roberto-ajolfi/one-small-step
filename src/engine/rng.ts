/**
 * Seeded PRNG — the engine's only source of randomness (NFR2 determinism).
 *
 * All randomness flows through this wrapper: the string seed is hashed into the
 * four sfc32 state words, and every draw advances `RngState` stored in GameState.
 * Two runs with the same seed + move log therefore produce identical states;
 * `Math.random` is forbidden in the engine (spec §2, §4.2).
 */

/** Serializable PRNG state: four 32-bit sfc32 words. */
export type RngState = readonly [number, number, number, number];

/** xmur3 string hash — deterministic seed expansion for sfc32. */
function hashSeed(seed: string): [number, number, number, number] {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const next = (): number => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
  return [next(), next(), next(), next()];
}

/** One sfc32 step: returns the next float in [0, 1) and the advanced state. */
function sfc32Step(state: RngState): { value: number; state: RngState } {
  let [a, b, c, d] = state;
  const t = (a + b + d) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  d = (d + 1) | 0;
  c = (c + t) | 0;
  return { value: (t >>> 0) / 4294967296, state: [a >>> 0, b >>> 0, c >>> 0, d >>> 0] };
}

/**
 * Creates the initial RNG state for a seed string, warmed up so early outputs
 * are well distributed (sfc32's recommended 12-round warmup).
 *
 * @param seed - any string; identical seeds yield identical streams.
 * @returns the warm state to store on GameState.
 */
export function createRng(seed: string): RngState {
  let state = hashSeed(seed) as RngState;
  for (let i = 0; i < 12; i++) state = sfc32Step(state).state;
  return state;
}

/**
 * Draws a float in [0, 1).
 *
 * @param state - current RNG state (unmodified).
 * @returns the value and the advanced state.
 */
export function randomFloat(state: RngState): { value: number; state: RngState } {
  return sfc32Step(state);
}

/**
 * Draws an integer in [0, maxExclusive) with rejection sampling (unbiased).
 *
 * @param state - current RNG state (unmodified).
 * @param maxExclusive - exclusive upper bound; must be > 0.
 * @returns the value and the advanced state.
 */
export function randomInt(state: RngState, maxExclusive: number): { value: number; state: RngState } {
  if (maxExclusive <= 0) throw new Error('randomInt requires maxExclusive > 0');
  const limit = Math.floor(4294967296 / maxExclusive) * maxExclusive;
  let current = state;
  for (;;) {
    const step = sfc32Step(current);
    current = step.state;
    const raw = (step.value * 4294967296) >>> 0;
    if (raw < limit) return { value: raw % maxExclusive, state: current };
  }
}

/**
 * Fisher–Yates shuffle driven by the seeded RNG.
 *
 * @param state - current RNG state (unmodified).
 * @param items - the array to shuffle (not modified).
 * @returns a new shuffled array and the advanced state.
 */
export function shuffle<T>(state: RngState, items: readonly T[]): { value: T[]; state: RngState } {
  const value = [...items];
  let current = state;
  for (let i = value.length - 1; i > 0; i--) {
    const step = randomInt(current, i + 1);
    current = step.state;
    const j = step.value;
    [value[i], value[j]] = [value[j], value[i]];
  }
  return { value, state: current };
}

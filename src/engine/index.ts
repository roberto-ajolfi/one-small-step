/**
 * Engine barrel — the public surface of the pure rules engine (spec §8.1:
 * each module exports through index.ts; cross-layer deep imports are forbidden).
 *
 * Zero React/DOM dependencies live anywhere under this directory (engine
 * purity, §1); content arrives injected via `newGame(seed, content)`.
 */

export * from './content';
export * from './rng';
export * from './state';
export * from './moves';
export * from './economy';
export * from './abilities';
export * from './phases';
export * from './soviet';
export * from './events';
export * from './scoring';
export * from './upkeep';
export * from './mission';
export * from './legal';
export * from './reducer';
export * from './invariants';

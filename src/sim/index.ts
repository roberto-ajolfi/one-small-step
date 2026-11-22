/**
 * Sim barrel — the public surface of the balance harness (spec §8.1).
 *
 * `cli.ts` is an entry point and deliberately not re-exported here (it runs
 * main() when executed); import its parsing helpers from `./cli` directly.
 */

export * from './policy';
export * from './tactics';
export * from './runner';
export * from './stats';
export * from './report';

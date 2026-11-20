/**
 * Data layer barrel — the public surface of `src/data` (spec §8.1): the five
 * content files, their zod schemas/loaders, and the validated `content` bundle.
 * Consumers (sim/web/print, tests) import from this barrel, never deep paths.
 */

export * from './schema';

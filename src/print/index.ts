/**
 * Print layer barrel — the public surface of `src/print` (spec §8.1): the kit
 * renderer and its file writer. Consumers import from here, never deep paths.
 */

export { DEFAULT_KIT_PATH, renderKit, writeKit } from './generate';

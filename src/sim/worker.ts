/**
 * Worker entry for the trial pool (spec §6: parallel via worker_threads).
 *
 * Receives a contiguous slice of the game range through `workerData`, plays
 * it with the named shipped policy against a fresh content bundle, and posts
 * back `{records, anomalies}`. Loaded as `worker.ts` by `runner.ts` — under
 * `npm run sim` (tsx) the TypeScript loader is inherited by the thread.
 */

import { parentPort, workerData } from 'node:worker_threads';
import type { Tuning } from '../engine';
import { getPolicy } from './policy';
import { contentWithTuning, playRange } from './runner';

interface Slice {
  from: number;
  count: number;
  seed: string;
  policy: string;
  tuning?: Tuning;
}

if (!parentPort) throw new Error('sim/worker.ts must run inside a worker thread');

const slice = workerData as Slice;
const content = contentWithTuning(slice.tuning);
const policy = getPolicy(slice.policy);
parentPort.postMessage(playRange(slice.from, slice.count, slice.seed, content, policy));

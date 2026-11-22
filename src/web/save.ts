/**
 * Save codec — the tiny replay-based save document (spec §4.2, §7).
 *
 * A save is `{version, seed, tuningHash, moves[]}` and reconstitutes the whole
 * game by `engine/replay()`: no state dumps, no drift between what was played
 * and what is restored. `tuningHash` fingerprints the *effective* tuning the
 * game was played under so a load can refuse to replay when a knob has moved —
 * replaying under different tuning would silently diverge from the original.
 *
 * Pure data only: no localStorage, no DOM, no engine transitions (spec §8.1
 * "I/O stays at the edges" — that edge is `store.ts`).
 */

import type { Move, Tuning } from '../engine';

/** Save document format version; bumped if the shape ever changes. */
export const SAVE_VERSION = 1;

/** The shareable, replayable save document (spec §4.2). */
export interface SaveGame {
  version: number;
  seed: string;
  tuningHash: string;
  moves: Move[];
}

/** Every legal `Move` discriminant — the save's allow-list on import. */
const MOVE_KINDS = new Set([
  'playCard',
  'developTech',
  'launchMission',
  'resolvePhase',
  'resolveAbility',
  'payRepair',
  'flySideMission',
  'discardForLimit',
  'endTurn',
]);

/** Recursively sorts object keys so two equal tunings stringify identically. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Fingerprints a tuning bundle (djb2 over its stable JSON) as 8 hex digits.
 *
 * @param tuning - the effective tuning in play (base + overrides).
 * @returns a short, stable hash for the save document.
 */
export function tuningHash(tuning: Tuning): string {
  const text = stableStringify(tuning);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

function isMove(value: unknown): value is Move {
  if (typeof value !== 'object' || value === null) return false;
  const kind = (value as { t?: unknown }).t;
  return typeof kind === 'string' && MOVE_KINDS.has(kind);
}

/**
 * Parses and validates a save document.
 *
 * @param text - raw JSON text from a slot or an imported file.
 * @returns the decoded save, ready for `replay()`.
 * @throws Error with a human-readable reason when the document is not a
 *   version-1 save (malformed JSON, wrong version, damaged move journal).
 */
export function parseSave(text: string): SaveGame {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('that file is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null) throw new Error('that file is not a save document');
  const doc = raw as Record<string, unknown>;

  if (doc.version !== SAVE_VERSION) {
    throw new Error(`unsupported save version ${String(doc.version)} (expected ${SAVE_VERSION})`);
  }
  if (typeof doc.seed !== 'string' || doc.seed.length === 0) {
    throw new Error('save is missing its seed');
  }
  if (typeof doc.tuningHash !== 'string') throw new Error('save is missing its tuning hash');
  if (!Array.isArray(doc.moves)) throw new Error('save is missing its move journal');

  const moves: Move[] = [];
  doc.moves.forEach((entry, index) => {
    if (!isMove(entry)) throw new Error(`save move #${index + 1} is not a known move`);
    moves.push(entry);
  });

  return { version: SAVE_VERSION, seed: doc.seed, tuningHash: doc.tuningHash, moves };
}

/** Serializes a save document for a slot, a file, or the clipboard. */
export function serializeSave(save: SaveGame): string {
  return JSON.stringify(save);
}

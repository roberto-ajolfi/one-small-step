/**
 * Game session store — the single mutable object behind the React UI (spec §7).
 *
 * Wraps one engine session (`{state, moves, snapshots}`) and exposes the UI
 * verbs: `dispatch` (the only forward transition), session-level `undo`/`redo`
 * over the move journal + checkpoints (spec §4.2 — these are NOT engine moves),
 * localStorage save slots, JSON file export/import, and seed sharing through
 * the URL hash. React binds through `useGameSession.ts`.
 *
 * I/O edge (spec §8.1): this is the only web module allowed to touch
 * `localStorage`, `history` and file downloads. The engine stays pure; every
 * transition goes through `apply()`.
 */

import {
  IllegalMove,
  apply,
  newGame as startGame,
  type Content,
  type GameState,
  type Move,
  type Tuning,
} from '../engine';
import { loadContent, parseOrThrow, tuningSchema } from '../data';
import { SAVE_VERSION, parseSave, serializeSave, tuningHash, type SaveGame } from './save';

// ---------------------------------------------------------------------------
// Tuning overrides (spec §7: reuse the sim's `--tuning` merge pattern)
// ---------------------------------------------------------------------------

/** Scalar tuning knobs a designer may override (nested tables stay structural). */
export type TuningOverrideKey = {
  [K in keyof Tuning]: Tuning[K] extends number ? K : never;
}[keyof Tuning];

export type TuningOverrides = Partial<Record<TuningOverrideKey, number>>;

/** Content shared by every session; only `tuning` is ever rebuilt (per handoff). */
const baseContent = loadContent();

/**
 * Builds a content bundle with tuning overrides merged exactly like the
 * harness's `--tuning` flag: `{...loadTuning(), ...overrides}` re-validated
 * through `tuningSchema`. The shared bundle is never mutated.
 *
 * @throws Error listing the offending knob when an override is out of range.
 */
export function buildContent(overrides: TuningOverrides): Content {
  const tuning = parseOrThrow(tuningSchema, { ...baseContent.tuning, ...overrides }, 'tuning');
  return { ...baseContent, tuning };
}

/** Drops overrides that would not survive `tuningSchema` (share links). */
function sanitizeOverrides(overrides: TuningOverrides): TuningOverrides {
  try {
    buildContent(overrides);
    return overrides;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Session model
// ---------------------------------------------------------------------------

/** Why a move was refused — the ActionLog's "why illegal?" trail (spec §7). */
export interface Refusal {
  turn: number;
  text: string;
}

/** Metadata shown on a save slot (slot storage is internal, not the spec format). */
export interface SaveSlot {
  id: string;
  savedAt: string;
  turn: number;
  year: number;
  moves: number;
  seed: string;
}

/** Immutable view handed to React via `useSyncExternalStore` (spec §7). */
export interface SessionSnapshot {
  readonly state: GameState;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly refusals: readonly Refusal[];
  readonly overrides: TuningOverrides;
  readonly slots: readonly SaveSlot[];
}

/** A restored position: the state after `at` moves, kept for O(10) undo. */
interface Checkpoint {
  at: number;
  state: GameState;
}

/** Spec §4.2: snapshot every 10 moves and at every turn boundary. */
const SNAPSHOT_EVERY = 10;

const needsCheckpoint = (prev: GameState, next: GameState): boolean =>
  next.moves.length % SNAPSHOT_EVERY === 0 || next.turn !== prev.turn;

/** A shareable seed for a fresh game (the seed is an input, not game randomness). */
export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function replayWithCheckpoints(seed: string, content: Content, moves: readonly Move[]) {
  let state = startGame(seed, content);
  const checkpoints: Checkpoint[] = [{ at: 0, state }];
  for (const move of moves) {
    const prev = state;
    state = apply(state, move);
    if (needsCheckpoint(prev, state)) checkpoints.push({ at: state.moves.length, state });
  }
  return { state, checkpoints };
}

// ---------------------------------------------------------------------------
// GameSession
// ---------------------------------------------------------------------------

export class GameSession {
  private overrides: TuningOverrides;
  private content: Content;
  private current: GameState;
  private checkpoints: Checkpoint[];
  private redoMoves: Move[];
  private refusals: Refusal[];
  private slots: SaveSlot[];
  private listeners = new Set<() => void>();
  private cache: SessionSnapshot;

  constructor(overrides: TuningOverrides = {}, seed?: string) {
    this.overrides = sanitizeOverrides(overrides);
    this.content = buildContent(this.overrides);
    this.current = startGame(seed ?? randomSeed(), this.content);
    this.checkpoints = [{ at: 0, state: this.current }];
    this.redoMoves = [];
    this.refusals = [];
    this.slots = readSlots();
    this.cache = this.compose();
  }

  /** `useSyncExternalStore` subscribe. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** `useSyncExternalStore` snapshot — referentially stable between mutations. */
  getState = (): SessionSnapshot => this.cache;

  /**
   * Applies one move. Illegal moves are never swallowed: the reason is recorded
   * for the ActionLog and returned to the caller (spec §7 interaction model).
   *
   * @returns `null` on success, or the human-readable refusal reason.
   */
  dispatch(move: Move): string | null {
    const prev = this.current;
    let next: GameState;
    try {
      next = apply(prev, move);
    } catch (error) {
      if (error instanceof IllegalMove) {
        this.refuse(prev, error.message);
        return error.message;
      }
      throw error;
    }
    this.current = next;
    this.redoMoves = [];
    this.recordCheckpoint(prev);
    this.commit();
    return null;
  }

  /** Restores the previous position; the undone move becomes redoable. */
  undo(): void {
    const cur = this.current;
    const target = cur.moves.length - 1;
    if (target < 0) return;
    const base = this.checkpointFor(target);
    let state = base.state;
    for (let i = base.at; i < target; i++) state = apply(state, cur.moves[i]);
    this.redoMoves = [...this.redoMoves, cur.moves[target]];
    this.checkpoints = this.checkpoints.filter((c) => c.at <= target);
    this.current = state;
    this.commit();
  }

  /** Re-applies the last undone move (stack cleared by any new move). */
  redo(): void {
    const move = this.redoMoves[this.redoMoves.length - 1];
    if (!move) return;
    const prev = this.current;
    try {
      this.current = apply(prev, move);
    } catch (error) {
      this.redoMoves = [];
      if (error instanceof IllegalMove) this.refuse(prev, error.message);
      else this.commit();
      return;
    }
    this.redoMoves = this.redoMoves.slice(0, -1);
    this.recordCheckpoint(prev);
    this.commit();
  }

  /** Starts a fresh game — with `seed` when given, else a new shareable seed. */
  newGame(seed?: string): void {
    this.current = startGame(seed ?? randomSeed(), this.content);
    this.checkpoints = [{ at: 0, state: this.current }];
    this.redoMoves = [];
    this.refusals = [];
    syncUrl(this.current.seed, this.overrides);
    this.commit();
  }

  /**
   * Applies dev tuning overrides and restarts on the current seed (a journal
   * recorded under one tuning must not be replayed under another).
   *
   * @returns `null` on success, or the validation reason to show in the panel.
   */
  setTuning(overrides: TuningOverrides): string | null {
    let content: Content;
    try {
      content = buildContent(overrides);
    } catch (error) {
      return error instanceof Error ? error.message : 'invalid tuning value';
    }
    this.overrides = overrides;
    this.content = content;
    this.newGame(this.current.seed);
    return null;
  }

  // -- Save / load ---------------------------------------------------------

  /** The current position as the tiny replay-based save document (spec §4.2). */
  encodeSave(): SaveGame {
    return {
      version: SAVE_VERSION,
      seed: this.current.seed,
      tuningHash: tuningHash(this.content.tuning),
      moves: [...this.current.moves],
    };
  }

  /**
   * Restores a save document by replay. Refuses when the effective tuning no
   * longer matches the save's hash — replaying would diverge from what was played.
   *
   * @returns `null` on success, or a human-readable reason.
   */
  loadSave(save: SaveGame): string | null {
    const expected = tuningHash(this.content.tuning);
    if (save.tuningHash !== expected) {
      return 'this save was made under different tuning — restore that tuning before loading';
    }
    try {
      const { state, checkpoints } = replayWithCheckpoints(save.seed, this.content, save.moves);
      this.current = state;
      this.checkpoints = checkpoints;
    } catch (error) {
      return error instanceof Error ? `cannot replay this save: ${error.message}` : 'cannot replay this save';
    }
    this.redoMoves = [];
    this.refusals = [];
    syncUrl(this.current.seed, this.overrides);
    this.commit();
    return null;
  }

  /** Parses and loads a save document (slot text, imported file, clipboard). */
  loadSaveText(text: string): string | null {
    let save: SaveGame;
    try {
      save = parseSave(text);
    } catch (error) {
      return error instanceof Error ? error.message : 'that file is not a save';
    }
    return this.loadSave(save);
  }

  /** JSON text of the current position — the portable export (spec §7). */
  exportText(): string {
    return serializeSave(this.encodeSave());
  }

  // -- Slots (localStorage) ------------------------------------------------

  saveToSlot(id: string): string | null {
    const save = this.encodeSave();
    const record = {
      savedAt: new Date().toISOString(),
      turn: this.current.turn,
      year: this.current.year,
      moves: save.moves.length,
      seed: save.seed,
      save: serializeSave(save),
    };
    try {
      localStorage.setItem(slotKey(id), JSON.stringify(record));
    } catch {
      return 'browser storage is unavailable — use Export to save to a file';
    }
    this.slots = readSlots();
    this.commit();
    return null;
  }

  loadFromSlot(id: string): string | null {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(slotKey(id));
    } catch {
      return 'browser storage is unavailable';
    }
    if (raw === null) return `slot ${id.toUpperCase()} is empty`;
    let text: string;
    try {
      text = (JSON.parse(raw) as { save: string }).save;
    } catch {
      return `slot ${id.toUpperCase()} is damaged`;
    }
    return this.loadSaveText(text);
  }

  deleteSlot(id: string): void {
    try {
      localStorage.removeItem(slotKey(id));
    } catch {
      return;
    }
    this.slots = readSlots();
    this.commit();
  }

  // -- Internals -----------------------------------------------------------

  private refuse(prev: GameState, text: string): void {
    this.refusals = [...this.refusals, { turn: prev.turn, text }].slice(-40);
    this.commit();
  }

  private recordCheckpoint(prev: GameState): void {
    const at = this.current.moves.length;
    if (needsCheckpoint(prev, this.current)) {
      this.checkpoints = [...this.checkpoints.filter((c) => c.at < at), { at, state: this.current }];
    }
  }

  private checkpointFor(target: number): Checkpoint {
    let found = this.checkpoints[0];
    for (const checkpoint of this.checkpoints) {
      if (checkpoint.at <= target) found = checkpoint;
      else break;
    }
    return found;
  }

  private compose(): SessionSnapshot {
    return {
      state: this.current,
      canUndo: this.current.moves.length > 0,
      canRedo: this.redoMoves.length > 0,
      refusals: this.refusals,
      overrides: this.overrides,
      slots: this.slots,
    };
  }

  private commit(): void {
    this.cache = this.compose();
    for (const listener of this.listeners) listener();
  }
}

// ---------------------------------------------------------------------------
// localStorage slots (internal storage; the portable format is `SaveGame`)
// ---------------------------------------------------------------------------

/** Save slots offered by the Header's save/load menu. */
export const SLOT_IDS = ['a', 'b', 'c'] as const;

const slotKey = (id: string) => `one-small-step:save:${id}`;

interface SlotRecord {
  savedAt: string;
  turn: number;
  year: number;
  moves: number;
  seed: string;
  save: string;
}

function readSlots(): SaveSlot[] {
  const slots: SaveSlot[] = [];
  for (const id of SLOT_IDS) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(slotKey(id));
    } catch {
      raw = null;
    }
    if (raw === null) continue;
    try {
      const record = JSON.parse(raw) as SlotRecord;
      slots.push({
        id,
        savedAt: record.savedAt,
        turn: record.turn,
        year: record.year,
        moves: record.moves,
        seed: record.seed,
      });
    } catch {
      // A damaged slot is simply not offered; deleteSlot clears it.
    }
  }
  return slots;
}

// ---------------------------------------------------------------------------
// Seed sharing through the URL hash: `#/play?seed=…&tuning=…` (spec §7)
// ---------------------------------------------------------------------------

/** Builds the shareable link for a game (seed + effective tuning overrides). */
export function shareUrl(seed: string, overrides: TuningOverrides = {}): string {
  const params = new URLSearchParams({ seed });
  if (Object.keys(overrides).length > 0) params.set('tuning', JSON.stringify(overrides));
  const base = typeof location === 'undefined' ? '' : `${location.origin}${location.pathname}`;
  return `${base}#/play?${params.toString()}`;
}

/** Reads a `#/play?seed=…&tuning=…` hash back into a session request. */
export function parseShareHash(hash: string): { seed?: string; overrides?: TuningOverrides } {
  const query = hash.replace(/^#\/play\??/, '');
  if (!query) return {};
  const params = new URLSearchParams(query);
  const result: { seed?: string; overrides?: TuningOverrides } = {};
  const seed = params.get('seed');
  if (seed) result.seed = seed;
  const tuning = params.get('tuning');
  if (tuning) result.overrides = sanitizeOverrides(parseOverrides(tuning));
  return result;
}

/**
 * Decodes a tuning override blob (JSON of scalar knobs). Unknown keys and
 * non-numeric values are dropped: a share link must never crash the app.
 */
function parseOverrides(text: string): TuningOverrides {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {};
  }
  if (typeof raw !== 'object' || raw === null) return {};
  const overrides: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key in baseContent.tuning && typeof value === 'number' && Number.isFinite(value)) {
      overrides[key] = value;
    }
  }
  return overrides as TuningOverrides;
}

/** Keeps the address bar in sync with the running game (spec §7 share links). */
function syncUrl(seed: string, overrides: TuningOverrides): void {
  if (typeof history === 'undefined' || typeof location === 'undefined') return;
  try {
    const url = shareUrl(seed, overrides).slice(location.origin.length);
    history.replaceState(null, '', url);
  } catch {
    // Sandboxed frames may refuse history writes; sharing still works via copy.
  }
}

// ---------------------------------------------------------------------------
// File export / import (spec §7 "JSON file export/import")
// ---------------------------------------------------------------------------

/** Downloads the current position as a `.json` save document. */
export function downloadSave(save: SaveGame, filename = 'one-small-step-save.json'): void {
  const blob = new Blob([serializeSave(save)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Reads a picked file to text for `loadSaveText` (browser File API). */
export function readFileText(file: File): Promise<string> {
  return file.text();
}

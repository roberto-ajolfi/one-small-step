/**
 * Store tests — the session wrapper contract behind the web UI (spec §7):
 * dispatch/undo/redo, checkpointed restore, save/load replay, and seed sharing.
 *
 * Runs headlessly in node: `localStorage` is stubbed where slot behaviour is
 * under test, and the scripted auto-player from `tests/integration` drives real
 * games through `session.dispatch` so undo/save exercise genuine move journals.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SAVE_VERSION, parseSave, serializeSave, tuningHash } from '../../src/web/save';
import {
  GameSession,
  buildContent,
  parseShareHash,
  shareUrl,
  type TuningOverrides,
} from '../../src/web/store';
import { content } from '../../src/data';
import { cardById, legalMoves, type GameState, type Move } from '../../src/engine';
import { chooseMove } from '../integration/scripted';

/** Comparable slice of a state — full JSON would drag the content bundle along. */
function fingerprint(state: GameState): string {
  return JSON.stringify({
    moves: state.moves,
    turn: state.turn,
    year: state.year,
    phase: state.phase,
    result: state.result,
    hand: state.hand,
    deck: state.deck,
    discard: state.discard,
    inPlay: state.inPlay,
    resources: state.resources,
    actionsLeft: state.actionsLeft,
    tech: state.tech,
    crewPool: state.crewPool,
    soviet: state.soviet,
    campaign: state.campaign,
    sideMissions: state.sideMissions,
    perks: state.perks,
    vp: state.vp,
    pending: state.pending,
    mission: state.mission,
  });
}

/** Drives `count` moves through the session with the scripted auto-player. */
function autoplay(session: GameSession, count: number): void {
  for (let i = 0; i < count; i++) {
    const state = session.getState().state;
    if (state.phase === 'gameOver') return;
    const move = chooseMove(state);
    const reason = session.dispatch(move);
    expect(reason, `move ${move.t} should be legal`).toBeNull();
  }
}

/** Minimal in-memory `localStorage` so slot tests run outside a browser. */
function stubStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  return store;
}

describe('GameSession dispatch', () => {
  it('applies legal moves and journals them', () => {
    const session = new GameSession({}, 'SEED-1');
    expect(session.getState().state.moves).toHaveLength(0);
    expect(session.dispatch({ t: 'resolvePhase' })).toBeNull();
    expect(session.getState().state.moves).toHaveLength(1);
    expect(session.getState().state.phase).toBe('actions');
    expect(session.getState().canUndo).toBe(true);
  });

  it('refuses illegal moves with a readable reason and records it', () => {
    const session = new GameSession({}, 'SEED-1');
    const reason = session.dispatch({ t: 'playCard', card: '2H', mode: 'money' });
    expect(reason).toBe('action is only legal during the action phase');
    expect(session.getState().state.moves).toHaveLength(0);
    expect(session.getState().refusals).toEqual([
      { turn: 1, text: 'action is only legal during the action phase' },
    ]);
  });
});

describe('GameSession undo/redo', () => {
  it('walks back and forward to identical positions', () => {
    const session = new GameSession({}, 'SEED-2');
    autoplay(session, 6);
    const done = fingerprint(session.getState().state);

    for (let i = 0; i < 6; i++) session.undo();
    expect(session.getState().state.moves).toHaveLength(0);
    expect(session.getState().canUndo).toBe(false);
    expect(session.getState().canRedo).toBe(true);

    for (let i = 0; i < 6; i++) session.redo();
    expect(fingerprint(session.getState().state)).toBe(done);
  });

  it('restores across checkpoint boundaries', () => {
    const session = new GameSession({}, 'SEED-3');
    autoplay(session, 25);
    const full = fingerprint(session.getState().state);

    // 25 moves crosses at least two 10-move checkpoints plus turn boundaries.
    for (let i = 0; i < 25; i++) session.undo();
    expect(session.getState().state.moves).toHaveLength(0);
    for (let i = 0; i < 25; i++) session.redo();
    expect(fingerprint(session.getState().state)).toBe(full);
  });

  it('keeps the redo stack when a move is refused', () => {
    const session = new GameSession({}, 'SEED-4B');
    autoplay(session, 3);
    session.undo();
    // Illegal in every state, so the refusal path is exercised deterministically.
    expect(session.dispatch({ t: 'developTech', tech: 'no-such-tech' })).not.toBeNull();
    expect(session.getState().canRedo).toBe(true);
  });

  it('drops the redo stack once a new move is dispatched', () => {
    const session = new GameSession({}, 'SEED-4');
    autoplay(session, 4);
    session.undo();
    expect(session.getState().canRedo).toBe(true);
    // Only a move that actually applies diverges the history; a refused move
    // leaves the redo stack intact (nothing changed).
    expect(session.dispatch(chooseMove(session.getState().state))).toBeNull();
    expect(session.getState().canRedo).toBe(false);
  });
});

describe('save / load', () => {
  it('round-trips a position through the replay-based document', () => {
    const session = new GameSession({}, 'SEED-5');
    autoplay(session, 12);
    const before = fingerprint(session.getState().state);

    const text = session.exportText();
    const restored = new GameSession({}, 'OTHER');
    expect(restored.loadSaveText(text)).toBeNull();
    expect(fingerprint(restored.getState().state)).toBe(before);
  });

  it('rebuilds the move journal so undo still works after a load', () => {
    const session = new GameSession({}, 'SEED-6');
    autoplay(session, 9);
    const moves = session.getState().state.moves.length;

    const restored = new GameSession({}, 'OTHER');
    expect(restored.loadSaveText(session.exportText())).toBeNull();
    expect(restored.getState().state.moves).toHaveLength(moves);
    restored.undo();
    expect(restored.getState().state.moves).toHaveLength(moves - 1);
  });

  it('refuses a save recorded under different tuning', () => {
    const session = new GameSession({}, 'SEED-7');
    autoplay(session, 3);
    const save = session.encodeSave();

    const retuned = new GameSession({ drawPerTurn: 3 }, 'SEED-7');
    const reason = retuned.loadSave(save);
    expect(reason).toMatch(/different tuning/);
  });

  it('rejects malformed documents with a readable reason', () => {
    const session = new GameSession({}, 'SEED-8');
    expect(session.loadSaveText('not json')).toBe('that file is not valid JSON');
    expect(session.loadSaveText('{"version":1}')).toBe('save is missing its seed');
    expect(session.loadSaveText(serializeSave({ version: 9, seed: 'x', tuningHash: 'y', moves: [] }))).toMatch(
      /unsupported save version 9/,
    );
    expect(
      session.loadSaveText(
        serializeSave({ version: SAVE_VERSION, seed: 'x', tuningHash: 'y', moves: [{ t: 'cheat' } as unknown as Move] }),
      ),
    ).toMatch(/save move #1 is not a known move/);
  });

  it('parseSave rejects non-documents', () => {
    expect(() => parseSave('42')).toThrow(/not a save document/);
    expect(() => parseSave('{"version":1,"seed":"s","tuningHash":"h","moves":"x"}')).toThrow(
      /missing its move journal/,
    );
  });
});

describe('tuning overrides', () => {
  it('merges overrides without touching the shared content bundle', () => {
    const before = content.tuning.drawPerTurn;
    const rebuilt = buildContent({ drawPerTurn: 5 });
    expect(rebuilt.tuning.drawPerTurn).toBe(5);
    expect(content.tuning.drawPerTurn).toBe(before);
    expect(buildContent({}).tuning.drawPerTurn).toBe(before);
  });

  it('fingerprints tuning so a changed knob is detected', () => {
    const a = tuningHash(buildContent({}).tuning);
    const b = tuningHash(buildContent({}).tuning);
    const c = tuningHash(buildContent({ repairCostMinor: 9 }).tuning);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('applies overrides through setTuning and restarts on the same seed', () => {
    const session = new GameSession({}, 'SEED-9');
    autoplay(session, 4);
    const seed = session.getState().state.seed;
    expect(session.setTuning({ drawPerTurn: 3 })).toBeNull();
    expect(session.getState().state.seed).toBe(seed);
    expect(session.getState().state.moves).toHaveLength(0);
    expect(session.getState().overrides).toEqual({ drawPerTurn: 3 });
  });

  it('reports invalid override values instead of throwing', () => {
    const session = new GameSession({}, 'SEED-10');
    // The tuning panel's number field yields NaN when cleared — that must not
    // take down the session (range policy belongs to the data layer, M2).
    const reason = session.setTuning({ drawPerTurn: Number.NaN });
    expect(reason).toMatch(/drawPerTurn/);
    expect(session.getState().overrides).toEqual({});
  });
});

describe('seed sharing', () => {
  it('round-trips a seed and its tuning overrides through the URL hash', () => {
    const overrides: TuningOverrides = { drawPerTurn: 3, sovietDrift: 2 };
    const url = shareUrl('ABC123', overrides);
    expect(url).toContain('#/play?');
    const parsed = parseShareHash(url.slice(url.indexOf('#')));
    expect(parsed.seed).toBe('ABC123');
    expect(parsed.overrides).toEqual(overrides);
  });

  it('drops overrides that would not survive tuning validation', () => {
    const parsed = parseShareHash(
      '#/play?seed=ABC&tuning=' + encodeURIComponent(JSON.stringify({ drawPerTurn: 'lots' })),
    );
    expect(parsed.seed).toBe('ABC');
    expect(parsed.overrides).toEqual({});
  });

  it('ignores unknown knobs in a share link', () => {
    const parsed = parseShareHash(
      '#/play?seed=ABC&tuning=' + encodeURIComponent(JSON.stringify({ nope: 4, drawPerTurn: 4 })),
    );
    expect(parsed.overrides).toEqual({ drawPerTurn: 4 });
  });
});

describe('UI-shaped move journal', () => {
  /**
   * The scripted policy decides *what* to do; this layers on the *selections*
   * the step panels submit (`PendingWindow`), which `chooseMove` always leaves
   * empty. The result is the exact move shapes the UI puts on the journal.
   */
  function panelMove(state: GameState): { move: Move; shape: string } {
    const base = chooseMove(state);

    if (base.t === 'resolvePhase' && state.phase === 'prebid') {
      const prebid = [...state.hand, ...state.inPlay]
        .filter((id) => cardById(state.content, id).kind === 'equipment')
        .slice(0, 1);
      const boost = state.inPlay.filter((id) => cardById(state.content, id).kind === 'bonus').slice(0, 1);
      return {
        move: { ...base, prebid, boost },
        shape: `prebid:${prebid.length + boost.length}`,
      };
    }

    if (base.t === 'payRepair' && base.cards.length === 0) {
      const paying = legalMoves(state).find((m) => m.t === 'payRepair' && m.cards.length > 0);
      if (paying && paying.t === 'payRepair') {
        return { move: paying, shape: `payRepair:${paying.cards.length}` };
      }
    }

    const size =
      base.t === 'payRepair' || base.t === 'discardForLimit'
        ? base.cards.length
        : base.t === 'launchMission'
          ? base.crew.length + base.prebid.length
          : 0;
    return { move: base, shape: `${base.t}:${size}` };
  }

  it('plays whole games with non-empty panel selections', () => {
    const shapes = new Set<string>();
    let steps = 0;

    // Deliberate seeds: phases rarely fail at skilled play (a rules-level
    // observation recorded in the design doc's Open Questions), so these three
    // cover a repair window, a Kraft/Kranz window and a Soviet-win ending.
    for (const seed of ['SCAN-9', 'SCAN-35', 'SCAN-1']) {
      const session = new GameSession({}, seed);
      for (let step = 0; step < 500; step++) {
        const state = session.getState().state;
        if (state.phase === 'gameOver') break;
        const { move, shape } = panelMove(state);
        expect(session.dispatch(move), `seed ${seed} step ${step}: ${JSON.stringify(move)}`).toBeNull();
        shapes.add(shape);
        steps++;
      }
    }
    expect(steps).toBeGreaterThan(100);

    // The panels must really have submitted selections, not just empty defaults.
    const has = (prefix: string) => [...shapes].some((s) => s.startsWith(prefix) && !s.endsWith(':0'));
    expect(has('prebid:'), 'expected a non-empty pre-bid').toBe(true);
    expect(has('payRepair:'), 'expected a repair payment').toBe(true);
    expect(has('discardForLimit:'), 'expected a hand trim').toBe(true);
    expect(has('launchMission:'), 'expected a crewed launch').toBe(true);
    expect([...shapes].some((s) => s.startsWith('resolveAbility')), 'expected an ability answer').toBe(true);
  });
});

describe('save slots', () => {
  beforeEach(() => {
    stubStorage();
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('saves and reloads a slot', () => {
    const session = new GameSession({}, 'SEED-11');
    autoplay(session, 5);
    const before = fingerprint(session.getState().state);

    expect(session.saveToSlot('a')).toBeNull();
    expect(session.getState().slots).toHaveLength(1);
    expect(session.getState().slots[0]).toMatchObject({ id: 'a', turn: 2, seed: 'SEED-11' });

    session.newGame('FRESH');
    expect(session.loadFromSlot('a')).toBeNull();
    expect(fingerprint(session.getState().state)).toBe(before);
  });

  it('reports empty slots and clears them on delete', () => {
    const session = new GameSession({}, 'SEED-12');
    expect(session.loadFromSlot('b')).toBe('slot B is empty');
    session.saveToSlot('b');
    expect(session.getState().slots).toHaveLength(1);
    session.deleteSlot('b');
    expect(session.getState().slots).toHaveLength(0);
  });
});

/**
 * Render smoke tests — the web UI rendered to HTML (spec §7/§9).
 *
 * These walk a whole scripted game and render the board after every move, so
 * every phase and every pending window goes through React at least once. They
 * also assert the spec §7 a11y contract for icons: every `<button>` must carry
 * visible text or an `aria-label`, so an icon-only control is never nameless.
 */

import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { GameOverModal, PendingWindow } from '../../src/web/components';
import { BoardLayout } from '../../src/web/components';
import { GameSession } from '../../src/web/store';
import { SessionContext } from '../../src/web/useGameSession';
import { chooseMove } from '../integration/scripted';

const BOARD: ReactNode = (
  <>
    <BoardLayout />
    <PendingWindow />
    <GameOverModal />
  </>
);

function render(session: GameSession, node: ReactNode = BOARD): string {
  return renderToString(<SessionContext.Provider value={session}>{node}</SessionContext.Provider>);
}

/** Buttons with neither visible text nor an accessible name (spec §7 a11y). */
function namelessButtons(html: string): string[] {
  const found: string[] = [];
  for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const attrs = match[1];
    const text = match[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    const labelled = /aria-label="[^"]+"/.test(attrs) || /title="[^"]+"/.test(attrs);
    if (!labelled && text === '') found.push(match[0].slice(0, 160));
  }
  return found;
}

describe('web UI renders', () => {
  it('renders the full board for a fresh game', () => {
    const session = new GameSession({}, 'RENDER-1');
    const html = render(session);
    expect(html).toContain('Soviet track');
    expect(html).toContain('Mission');
    expect(html).toContain('Hardware');
    expect(html).toContain('Crew pool');
    expect(html).toContain('Hand');
  });

  it('renders every phase and pending window across a whole game', () => {
    const session = new GameSession({}, 'RENDER-2');
    const seen = new Set<string>();

    for (let step = 0; step < 260; step++) {
      const state = session.getState().state;
      seen.add(`${state.phase}:${state.pending?.kind ?? '-'}`);
      expect(render(session).length).toBeGreaterThan(200);
      if (state.phase === 'gameOver') break;
      expect(session.dispatch(chooseMove(state))).toBeNull();
    }

    // The scripted player must actually reach the interesting windows.
    for (const key of ['draw:-', 'actions:-', 'prebid:prebid', 'repair:repair', 'upkeep:handLimit']) {
      expect(seen.has(key), `expected to render state ${key}`).toBe(true);
    }
  });

  it('renders the ability window (Kraft / Kranz prompt)', () => {
    // The scripted player skips abilities, so rig the window open on a real
    // in-flight mission and render the step panel through a stub session.
    const session = new GameSession({}, 'RENDER-5');
    let state = session.getState().state;
    for (let step = 0; step < 260 && !state.mission; step++) {
      expect(session.dispatch(chooseMove(state))).toBeNull();
      state = session.getState().state;
    }
    expect(state.mission, 'scripted play should put a mission in flight').toBeTruthy();

    const rigged = {
      ...state,
      phase: 'mission',
      pending: { kind: 'ability', phaseIndex: 0, canKraft: true, canReroll: true },
    } as typeof state;
    const stub = {
      subscribe: () => () => undefined,
      getState: () => ({ ...session.getState(), state: rigged }),
      dispatch: () => null,
    } as unknown as GameSession;

    const html = renderToString(
      <SessionContext.Provider value={stub}>
        <PendingWindow />
      </SessionContext.Provider>,
    );
    expect(html).toContain('Kraft');
    expect(html).toContain('Reroll');
  });

  it('gives every button an accessible name', () => {
    const session = new GameSession({}, 'RENDER-3');
    expect(namelessButtons(render(session, <BoardLayout />))).toEqual([]);

    // …including the step panels, which are icon-heavy.
    const played = new GameSession({}, 'RENDER-4');
    for (let step = 0; step < 60 && played.getState().state.phase !== 'gameOver'; step++) {
      played.dispatch(chooseMove(played.getState().state));
    }
    expect(namelessButtons(render(played, <PendingWindow />))).toEqual([]);
  });

  it('never emits an empty aria-label', () => {
    const session = new GameSession({}, 'RENDER-6');
    const html = render(session);
    expect(html).not.toMatch(/aria-label="\s*"/);
  });
});

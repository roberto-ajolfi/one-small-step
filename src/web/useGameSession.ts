/**
 * React binding for the game session (spec §7 store).
 *
 * A `useSyncExternalStore` over the session object is the whole state layer
 * (spec §7: "No Redux/Zustand"). The session itself lives in `store.ts`; the
 * provider is written in `App.tsx` so this hook file stays JSX-free.
 */

import { createContext, useContext, useSyncExternalStore } from 'react';
import type { GameSession, SessionSnapshot } from './store';

/** Context carrying the one session instance for the running app. */
export const SessionContext = createContext<GameSession | null>(null);

/** The session — every gesture compiles to a `Move` through this (spec §7). */
export function useGameSession(): GameSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useGameSession must be used inside <SessionContext.Provider>');
  return session;
}

/** Subscribed view of the game: re-renders on every session commit. */
export function useGameState(): SessionSnapshot {
  const session = useGameSession();
  return useSyncExternalStore(session.subscribe, session.getState, session.getState);
}

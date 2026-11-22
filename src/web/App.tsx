/**
 * App — the web UI shell (spec §7).
 *
 * Creates the single game session (booting from a `#/play?seed=…&tuning=…`
 * share link when present) and mounts the board with its overlays. The whole
 * state layer is one `useSyncExternalStore` over that session (spec §7 store).
 */

import { useState } from 'react';
import {
  BoardLayout,
  GameOverModal,
  Header,
  PendingWindow,
  RulesOverlay,
  SaveMenu,
  TuningPanel,
} from './components';
import { GameSession, parseShareHash } from './store';
import { SessionContext } from './useGameSession';

/** Boots a session from the URL hash, else a fresh game with a new seed. */
function createSession(): GameSession {
  const { seed, overrides } = parseShareHash(typeof location === 'undefined' ? '' : location.hash);
  return new GameSession(overrides ?? {}, seed);
}

function Shell() {
  const [saveOpen, setSaveOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [tuningOpen, setTuningOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        onSave={() => setSaveOpen(true)}
        onRules={() => setRulesOpen(true)}
        onTuning={() => setTuningOpen(true)}
      />
      <main className="grow print-sheet">
        <BoardLayout />
      </main>
      <footer className="no-print border-t border-ink/20 px-4 py-3 text-micro text-ink-faint">
        One Small Step — a solitaire space-race card game. Engine, data and balance harness are
        deterministic: every game replays from its seed and move journal.
      </footer>

      {saveOpen ? <SaveMenu onClose={() => setSaveOpen(false)} /> : null}
      {rulesOpen ? <RulesOverlay onClose={() => setRulesOpen(false)} /> : null}
      {tuningOpen ? <TuningPanel onClose={() => setTuningOpen(false)} /> : null}
      <PendingWindow />
      <GameOverModal />
    </div>
  );
}

export function App() {
  const [session] = useState(createSession);
  return (
    <SessionContext.Provider value={session}>
      <Shell />
    </SessionContext.Provider>
  );
}

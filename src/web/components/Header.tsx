/**
 * Header — the board masthead (spec §7: "year/turn, seed field, undo/redo,
 * save/load, rules, tuning panel in dev").
 *
 * Mobile keeps it compact (spec §7 "sticky compact header"): the title, the
 * year/turn badges and one Menu button, with the seed field and toolbar behind
 * it. From `md` up everything is one row. Icon-only controls carry an
 * `aria-label` and a Tooltip so the toolbar stays keyboard-operable.
 */

import { useEffect, useState } from 'react';
import { Badge, Button, Icon, Tooltip } from '../ui';
import { shareUrl } from '../store';
import { useGameSession, useGameState } from '../useGameSession';

export interface HeaderProps {
  onSave: () => void;
  onRules: () => void;
  onTuning: () => void;
}

export function Header({ onSave, onRules, onTuning }: HeaderProps) {
  const session = useGameSession();
  const { state, canUndo, canRedo, overrides } = useGameState();
  const [seed, setSeed] = useState(state.seed);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Keep the field in step with the running game, but let the user type freely.
  useEffect(() => setSeed(state.seed), [state.seed]);

  const copyShare = async () => {
    const url = shareUrl(state.seed, overrides);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this share link', url);
    }
  };

  return (
    <header className="sticky top-0 z-20 border-b border-ink/30 bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-end gap-x-6 gap-y-2 px-3 py-2 sm:px-4 sm:py-3">
        <div className="min-w-0 grow">
          <h1 className="text-title tracking-poster text-ink">
            One Small Step
            <span className="ml-3 hidden text-micro font-normal normal-case tracking-normal text-ink-faint sm:inline">
              solitaire space race &middot; 1960&ndash;1969
            </span>
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="navy" srLabel="Current year">
              <Icon name="calendar" size={12} /> {state.year}
            </Badge>
            <Badge tone="navy" srLabel="Current turn">
              <Icon name="clock" size={12} /> Turn {state.turn} of {state.content.tuning.turnsPerYear * 10}
            </Badge>
            <Badge tone="muted" srLabel="Game phase">
              {state.phase}
            </Badge>
            {Object.keys(overrides).length > 0 ? (
              <Badge tone="gold" srLabel="Dev tuning overrides active">
                tuning x{Object.keys(overrides).length}
              </Badge>
            ) : null}
          </div>
        </div>

        <Button
          className="md:hidden"
          size="sm"
          icon="chevron"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? 'Close' : 'Menu'}
        </Button>

        <div
          className={`${menuOpen ? 'flex' : 'hidden'} w-full flex-wrap items-center gap-2 md:flex md:w-auto`}
        >
          <label className="flex items-center gap-2">
            <span className="eyebrow">Seed</span>
            <input
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') session.newGame(seed.trim() || undefined);
              }}
              spellCheck={false}
              aria-label="Game seed — press Enter to start a game with this seed"
              className="w-28 border border-ink/30 bg-paper px-2 py-1.5 font-mono text-xs text-ink"
            />
          </label>
          <Tooltip label="Start a new game with this seed">
            <Button size="sm" icon="newGame" onClick={() => session.newGame(seed.trim() || undefined)}>
              New
            </Button>
          </Tooltip>
          <Tooltip label="Copy a shareable link (seed + tuning)">
            <Button size="sm" icon={copied ? 'check' : 'share'} onClick={copyShare}>
              {copied ? 'Copied' : 'Share'}
            </Button>
          </Tooltip>
          <Tooltip label="Undo the last move">
            <Button size="sm" icon="undo" disabledReason={canUndo ? undefined : 'nothing to undo'} onClick={session.undo}>
              Undo
            </Button>
          </Tooltip>
          <Tooltip label="Redo the last undone move">
            <Button size="sm" icon="redo" disabledReason={canRedo ? undefined : 'nothing to redo'} onClick={session.redo}>
              Redo
            </Button>
          </Tooltip>
          <Tooltip label="Save, load, export or import a game">
            <Button size="sm" icon="save" onClick={onSave}>
              Save
            </Button>
          </Tooltip>
          <Tooltip label="In-game rules reference">
            <Button size="sm" icon="book" onClick={onRules}>
              Rules
            </Button>
          </Tooltip>
          {/* Spec §7: the tuning panel is dev tooling (vite dev / test builds). */}
          {import.meta.env.DEV ? (
            <Tooltip label="Dev tuning panel">
              <Button size="sm" icon="adjust" onClick={onTuning}>
                Tuning
              </Button>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </header>
  );
}

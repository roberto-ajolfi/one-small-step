/**
 * TuningPanel — the dev tuning editor (spec §7 Header "tuning panel in dev").
 *
 * Merges overrides exactly like the harness's `--tuning` flag (a shallow merge
 * re-validated through `tuningSchema`) and restarts the game on the current
 * seed, so a move journal is never replayed under a different tuning. Only
 * scalar knobs are editable here; the nested tables stay structural.
 */

import { useState } from 'react';
import type { TuningOverrideKey } from '../store';
import { Badge, Button, Modal } from '../ui';
import { useGameSession, useGameState } from '../useGameSession';

interface Knob {
  key: TuningOverrideKey;
  label: string;
  hint: string;
}

const KNOBS: Knob[] = [
  { key: 'drawPerTurn', label: 'Draw per turn', hint: 'cards drawn in the draw phase' },
  { key: 'actionsPerTurn', label: 'Actions per turn', hint: 'FR2.2' },
  { key: 'handLimit', label: 'Hand limit', hint: 'year-end trim threshold' },
  { key: 'turnsPerYear', label: 'Turns per year', hint: '3 turns x 10 years = 30' },
  { key: 'startingMoney', label: 'Starting money', hint: 'FR2.1' },
  { key: 'startingRd', label: 'Starting R&D', hint: 'FR2.1' },
  { key: 'repairCostMinor', label: 'Repair cost (minor)', hint: 'FR5.5' },
  { key: 'repairCostMajor', label: 'Repair cost (major)', hint: 'FR5.5' },
  { key: 'majorFailureMinShortfall', label: 'Major failure at shortfall', hint: 'ruling 1' },
  { key: 'retryPenalty', label: 'Retry penalty', hint: '+difficulty after a failure' },
  { key: 'finalMissionBonus', label: 'Program-final bonus', hint: '+difficulty on the last mission' },
  { key: 'sovietDrift', label: 'Soviet drift', hint: 'spaces per turn' },
  { key: 'sovietPushFailure', label: 'Push on mission failure', hint: 'FR9.2' },
  { key: 'sovietPushSideMission', label: 'Push on side-mission failure', hint: 'FR9.2' },
  { key: 'milestoneEvery', label: 'Milestone every', hint: 'track spaces' },
  { key: 'milestoneVpBite', label: 'Milestone VP bite', hint: 'FR10.1' },
  { key: 'moneyBiteEvery', label: 'Money bite every', hint: 'track spaces' },
  { key: 'milestoneMoneyBite', label: 'Milestone money bite', hint: 'FR10.1' },
  { key: 'sideMissionDifficulty', label: 'Side-mission difficulty', hint: 'FR7.1' },
  { key: 'sideMissionRetry', label: 'Side-mission retry', hint: 'flat penalty' },
  { key: 'sideMissionVp', label: 'Side-mission VP', hint: 'FR7.2' },
  { key: 'crewInjuryLaunches', label: 'Injury length', hint: 'launches missed' },
  { key: 'crewStunLaunches', label: 'Stun length', hint: 'launches missed' },
  { key: 'apollo1ActionLoss', label: 'Apollo 1 action loss', hint: 'FR9.3' },
];

export function TuningPanel({ onClose }: { onClose: () => void }) {
  const session = useGameSession();
  const { state, overrides } = useGameState();
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(overrides).map(([key, value]) => [key, String(value)])),
  );
  const [error, setError] = useState<string | null>(null);

  const parseDraft = (): { ok: true; overrides: Partial<Record<TuningOverrideKey, number>> } | { ok: false; error: string } => {
    const next: Record<string, number> = {};
    for (const [key, text] of Object.entries(draft)) {
      if (text.trim() === '') continue;
      const value = Number(text);
      if (!Number.isFinite(value)) return { ok: false, error: `${key} must be a number` };
      next[key] = value;
    }
    return { ok: true, overrides: next as Partial<Record<TuningOverrideKey, number>> };
  };

  return (
    <Modal title="Dev tuning" eyebrow="developer tool" onClose={onClose} maxWidth="lg">
      <div className="flex flex-col gap-4">
        <p className="text-micro text-ink-soft">
          Overrides merge over <code>tuning.json</code> exactly like the harness's <code>--tuning</code> flag.
          Applying them starts a new game on seed <strong>{state.seed}</strong> — a journal recorded under one
          tuning is never replayed under another.
        </p>

        {error ? (
          <p className="border border-patch-red/50 bg-patch-red/10 px-3 py-2 text-micro text-patch-red">{error}</p>
        ) : null}

        <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {KNOBS.map(({ key, label, hint }) => {
            const effective = state.content.tuning[key];
            return (
              <li key={key} className="flex items-center gap-2">
                <label className="min-w-0 grow">
                  <span className="block text-micro font-semibold text-ink">{label}</span>
                  <span className="block text-micro text-ink-faint">{hint}</span>
                </label>
                <span className="text-micro text-ink-faint">{effective}</span>
                <input
                  type="number"
                  value={draft[key] ?? ''}
                  placeholder="default"
                  aria-label={`${label} override`}
                  onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                  className="w-24 border border-ink/30 bg-paper px-2 py-1.5 font-mono text-xs text-ink"
                />
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-2 border-t border-ink/20 pt-3">
          <Button
            variant="primary"
            onClick={() => {
              const parsed = parseDraft();
              if (!parsed.ok) {
                setError(parsed.error);
                return;
              }
              const reason = session.setTuning(parsed.overrides);
              if (reason) {
                setError(reason);
                return;
              }
              setError(null);
              onClose();
            }}
          >
            Apply & restart
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setDraft({});
              setError(null);
              session.setTuning({});
            }}
          >
            Reset to shipped tuning
          </Button>
          <Badge tone="muted">{Object.keys(overrides).length} override(s) active</Badge>
        </div>
      </div>
    </Modal>
  );
}

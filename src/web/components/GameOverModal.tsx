/**
 * GameOverModal — the ending screen (spec §7: "result, score ledger, tier,
 * seed share"). Shown as soon as `state.phase === 'gameOver'`; the game stays
 * replayable from its seed and journal.
 */

import { useState } from 'react';
import { programCompleted, scoreGame } from '../../engine';
import { shareUrl } from '../store';
import { Badge, Button, Icon, Modal } from '../ui';
import { useGameSession, useGameState } from '../useGameSession';

const ENDINGS = {
  moon: {
    title: 'The Eagle has landed',
    blurb: 'Apollo 11 splashed down — the race is won and history is rewritten.',
  },
  timedOut: {
    title: 'The decade is over',
    blurb: 'Turn 30 ended with no Moon landing. The program is graded on what was achieved.',
  },
  sovietsWon: {
    title: 'The Soviets landed first',
    blurb: 'The final track space was crossed before Apollo 11 splashed down. Total loss.',
  },
} as const;

export function GameOverModal() {
  const session = useGameSession();
  const { state, overrides } = useGameState();
  const [copied, setCopied] = useState(false);
  if (state.phase !== 'gameOver' || !state.result) return null;

  const score = scoreGame(state);
  const ending = ENDINGS[state.result];
  const rows: { label: string; value: string }[] = [
    { label: 'Mission VP', value: `+${state.vp.mission}` },
    { label: 'Side missions', value: `+${state.vp.side}` },
    { label: 'Program bonuses', value: `+${state.vp.program}` },
    { label: 'Failure penalties', value: `-${state.vp.penaltyFailures}` },
    { label: 'Soviet milestone bites', value: `-${state.vp.penaltyMilestones}` },
    ...(['mercury', 'gemini', 'apollo'] as const).map((program) => ({
      label: `${program} complete`,
      value: programCompleted(state, program) ? 'bonus earned' : 'not complete',
    })),
    { label: 'Final score', value: `${score.vp}` },
    { label: 'Grade', value: score.tier },
  ];

  return (
    <Modal eyebrow="Game over" title={ending.title} maxWidth="md">
      <div className="flex flex-col gap-4">
        <p className="text-micro text-ink-soft">{ending.blurb}</p>

        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="gold" className="px-3 py-2 text-label">
            <Icon name={state.result === 'moon' ? 'trophy' : state.result === 'timedOut' ? 'clock' : 'flag'} size={16} />
            {score.tier}
          </Badge>
          <p className="font-display text-display text-ink">{score.vp} VP</p>
          <Badge tone="navy">{state.result}</Badge>
        </div>

        <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline gap-2 border-b border-ink/10 py-1.5">
              <dt className="grow text-micro uppercase tracking-wider text-ink-faint">{row.label}</dt>
              <dd className="text-micro font-semibold text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap items-center gap-2 border-t border-ink/20 pt-3">
          <Badge tone="muted">
            <Icon name="dice" size={12} /> seed {state.seed}
          </Badge>
          <Button
            icon={copied ? 'check' : 'share'}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareUrl(state.seed, overrides));
                setCopied(true);
              } catch {
                window.prompt('Copy this share link', shareUrl(state.seed, overrides));
              }
            }}
          >
            {copied ? 'Link copied' : 'Share this game'}
          </Button>
          <Button variant="primary" icon="newGame" onClick={() => session.newGame(state.seed)}>
            Replay this seed
          </Button>
          <Button variant="secondary" icon="newGame" onClick={() => session.newGame()}>
            New game
          </Button>
        </div>
      </div>
    </Modal>
  );
}

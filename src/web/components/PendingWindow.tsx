/**
 * PendingWindow — the modal step panels driven by `state.pending` (spec §7:
 * "Pending windows (pre-bid, repair, event roll) render as modal step panels").
 *
 * Four windows exist in the engine (`prebid`, `ability`, `repair`,
 * `handLimit`); each panel is self-contained so the decision can be made
 * without leaving the dialog. The dialog is a forced step — it has no close
 * button because the game cannot proceed until it is answered.
 */

import { useState } from 'react';
import {
  cardById,
  kraftAmount,
  missionById,
  outcomeFor,
  phaseDifficulty,
  repairPaymentValue,
  validateMove,
} from '../../engine';
import type { Card, CardId, GameState } from '../../engine';
import { Badge, Button, CardPicker, CardTile, Modal, type CardChoice } from '../ui';
import { useGameSession, useGameState } from '../useGameSession';

/** One selectable instance: hand/in-play/pool entries may repeat a row id. */
function instances(state: GameState, ids: readonly { key: string; id: CardId }[]): CardChoice[] {
  return ids.map(({ key, id }) => ({ key, card: cardById(state.content, id) }));
}

/** Equipment that can be pre-bid: hand + in play, minus the reserved copy. */
function equipmentChoices(state: GameState): { key: string; id: CardId }[] {
  const reserved = new Set(state.mission?.reservedPrebid ?? []);
  const taken = new Set<string>();
  const out: { key: string; id: CardId }[] = [];
  const push = (key: string, id: CardId) => {
    if (cardById(state.content, id).kind !== 'equipment') return;
    if (reserved.has(id) && !taken.has(id)) {
      taken.add(id); // the reserved instance is not freely spendable (ruling 3)
      return;
    }
    out.push({ key, id });
  };
  state.hand.forEach((id, index) => push(`hand-${index}`, id));
  state.inPlay.forEach((id, index) => push(`play-${index}`, id));
  return out;
}

/** Held bonuses (in play only) that can boost a draw. */
function bonusChoices(state: GameState): { key: string; id: CardId }[] {
  return state.inPlay
    .map((id, index) => ({ key: `play-${index}`, id }))
    .filter(({ id }) => cardById(state.content, id).kind === 'bonus');
}

/** Repair fuel: persons + equipment from hand, unassigned pool members, held gear. */
function fuelChoices(state: GameState): { key: string; id: CardId }[] {
  const assigned = new Set(state.mission?.crew ?? []);
  const out: { key: string; id: CardId }[] = [];
  state.hand.forEach((id, index) => {
    const kind = cardById(state.content, id).kind;
    if (kind === 'person' || kind === 'equipment') out.push({ key: `hand-${index}`, id });
  });
  Object.keys(state.crewPool).forEach((id) => {
    if (!assigned.has(id)) out.push({ key: `pool-${id}`, id });
  });
  state.inPlay.forEach((id, index) => {
    const kind = cardById(state.content, id).kind;
    if (kind === 'equipment' || kind === 'bonus') out.push({ key: `play-${index}`, id });
  });
  return out;
}

function useToggleList(cap?: number) {
  const [picks, setPicks] = useState<string[]>([]);
  const toggle = (key: string) => {
    if (picks.includes(key)) {
      setPicks(picks.filter((entry) => entry !== key));
      return;
    }
    if (cap !== undefined && picks.length >= cap) return;
    setPicks([...picks, key]);
  };
  const reset = () => setPicks([]);
  return { picks, toggle, reset };
}

// ---------------------------------------------------------------------------

function PrebidStep({ phaseIndex }: { phaseIndex: number }) {
  const session = useGameSession();
  const { state } = useGameState();
  const equipment = useToggleList();
  const bonus = useToggleList();
  const mission = state.mission;
  const reserved = mission?.reservedPrebid ?? [];

  const equipmentOptions = equipmentChoices(state);
  const bonusOptions = bonusChoices(state);
  const prebid = equipment.picks.map((key) => equipmentOptions.find((c) => c.key === key)?.id) as CardId[];
  const boost = bonus.picks.map((key) => bonusOptions.find((c) => c.key === key)?.id) as CardId[];
  const reason = validateMove(state, { t: 'resolvePhase', prebid, boost }) ?? undefined;

  return (
    <Modal eyebrow={`Phase ${phaseIndex + 1}`} title="Pre-bid before the draw">
      <div className="flex flex-col gap-4">
        <p className="text-micro text-ink-soft">
          Commit equipment now to add its strength to this phase check, and hold Bonus cards to add
          &#8968;s/2&#8969;. Nothing committed is fine too — the fate card is drawn either way.
        </p>

        {reserved.length > 0 ? (
          <p className="flex flex-wrap items-center gap-2 text-micro text-ink-soft">
            <Badge tone="gold">pre-committed at launch</Badge>
            {reserved.join(', ')}
          </p>
        ) : null}

        <section>
          <h3 className="eyebrow mb-2">Equipment pre-bid</h3>
          <CardPicker
            choices={instances(state, equipmentOptions)}
            selected={equipment.picks}
            onToggle={equipment.toggle}
            label={(card) => `Pre-bid ${card.flavor ?? card.id}`}
            footnote={(card) => `adds +${card.s} to the check`}
            emptyText="No equipment in hand or in play."
          />
        </section>

        <section>
          <h3 className="eyebrow mb-2">Held bonus boost</h3>
          <CardPicker
            choices={instances(state, bonusOptions)}
            selected={bonus.picks}
            onToggle={bonus.toggle}
            label={(card) => `Boost with ${card.flavor ?? card.id}`}
            footnote={(card) => `adds +${Math.ceil(card.s / 2)} to the check`}
            emptyText="No Bonus card held in play."
          />
        </section>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            icon="dice"
            disabledReason={reason}
            onClick={() => {
              session.dispatch({ t: 'resolvePhase', prebid, boost });
              equipment.reset();
              bonus.reset();
            }}
          >
            Draw the fate card
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AbilityStep({ phaseIndex, canKraft, canReroll }: { phaseIndex: number; canKraft: boolean; canReroll: boolean }) {
  const session = useGameSession();
  const { state } = useGameState();
  const mission = state.mission;
  const definition = mission ? missionById(state.content, mission.missionId) : null;
  const phase = definition?.chain[phaseIndex];
  const difficulty = definition && phase ? phaseDifficulty(state, definition, phase) : 0;
  const base = mission?.currentBase ?? 0;
  const margin = base - difficulty;
  const outcome = outcomeFor(margin, state.content.tuning.majorFailureMinShortfall);
  const kraft = mission ? kraftAmount(state, mission) : 0;

  return (
    <Modal eyebrow={`Phase ${phaseIndex + 1}`} title={`${phase ?? 'Phase'} — the check failed`}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {mission?.drawnCard ? <CardTile card={cardById(state.content, mission.drawnCard)} className="w-32" /> : null}
          <div>
            <p className="font-display text-title text-ink">
              {base} vs {difficulty}
            </p>
            <p className="text-micro text-ink-soft">
              {`margin ${margin} \u00b7 ${outcome === 'major' ? 'major failure' : 'minor failure'} \u00b7 Kraft adds +${kraft}`}
            </p>
          </div>
        </div>

        <p className="text-micro text-ink-soft">
          Once-per-mission help from your tech support is available before the failure is written down.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="gold"
            icon="star"
            disabledReason={canKraft ? undefined : 'Kraft is not available'}
            onClick={() => session.dispatch({ t: 'resolveAbility', use: 'kraft' })}
          >
            Use Kraft (+{kraft})
          </Button>
          <Button
            variant="gold"
            icon="dice"
            disabledReason={canReroll ? undefined : 'the Kranz reroll is not available'}
            onClick={() => session.dispatch({ t: 'resolveAbility', use: 'reroll' })}
          >
            Reroll the draw
          </Button>
          <Button variant="secondary" onClick={() => session.dispatch({ t: 'resolveAbility' })}>
            Continue without help
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RepairStep({
  phaseIndex,
  outcome,
  cost,
}: {
  phaseIndex: number;
  outcome: 'minor' | 'major';
  cost: number;
}) {
  const session = useGameSession();
  const { state } = useGameState();
  const picks = useToggleList();
  const choices = fuelChoices(state);
  const chosen = picks.picks.map((key) => choices.find((c) => c.key === key)?.id) as CardId[];
  const rows: Card[] = chosen.map((id) => cardById(state.content, id));
  const value = repairPaymentValue(state, rows);
  const canPay = value >= cost;

  return (
    <Modal eyebrow={`Phase ${phaseIndex + 1}`} title={`${outcome === 'major' ? 'Major' : 'Minor'} failure — repair window`}>
      <div className="flex flex-col gap-4">
        <p className="text-micro text-ink-soft">
          Spend cards worth <strong>{cost}</strong> repair points to salvage the phase and continue the chain.
          Declining (or underpaying) fails the mission with nothing spent.
        </p>

        <CardPicker
          choices={instances(state, choices)}
          selected={picks.picks}
          onToggle={picks.toggle}
          label={(card) => `Burn ${card.flavor ?? card.id} for repair`}
          footnote={(card) => `worth ${card.kind === 'bonus' ? Math.ceil(card.s / 2) : card.s} repair points`}
          emptyText="No card is available as repair fuel."
        />

        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={canPay ? 'teal' : 'red'}>
            payment {value} / {cost}
          </Badge>
          <Button
            variant="primary"
            icon="tool"
            disabledReason={canPay ? undefined : `not enough repair value (${value} of ${cost})`}
            onClick={() => {
              session.dispatch({ t: 'payRepair', cards: chosen });
              picks.reset();
            }}
          >
            Pay for repairs
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              session.dispatch({ t: 'payRepair', cards: [] });
              picks.reset();
            }}
          >
            Decline — fail the mission
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function HandLimitStep({ excess }: { excess: number }) {
  const session = useGameSession();
  const { state } = useGameState();
  const picks = useToggleList(excess);
  const choices = state.hand.map((id, index) => ({ key: `hand-${index}`, id }));
  const chosen = picks.picks.map((key) => choices.find((c) => c.key === key)?.id) as CardId[];
  const reason = validateMove(state, { t: 'discardForLimit', cards: chosen }) ?? undefined;

  return (
    <Modal eyebrow="Year end" title="Trim your hand">
      <div className="flex flex-col gap-4">
        <p className="text-micro text-ink-soft">
          The hand limit is {state.content.tuning.handLimit} — discard exactly <strong>{excess}</strong> card(s)
          to end the year.
        </p>
        <CardPicker
          choices={instances(state, choices)}
          selected={picks.picks}
          onToggle={picks.toggle}
          label={(card) => `Discard ${card.flavor ?? card.id}`}
          emptyText="No cards in hand."
        />
        <Button
          variant="primary"
          disabledReason={reason}
          onClick={() => {
            session.dispatch({ t: 'discardForLimit', cards: chosen });
            picks.reset();
          }}
        >
          Discard {picks.picks.length} of {excess}
        </Button>
      </div>
    </Modal>
  );
}

export function PendingWindow() {
  const { state } = useGameState();
  const pending = state.pending;
  if (!pending) return null;

  switch (pending.kind) {
    case 'prebid':
      return <PrebidStep phaseIndex={pending.phaseIndex} />;
    case 'ability':
      return (
        <AbilityStep
          phaseIndex={pending.phaseIndex}
          canKraft={pending.canKraft}
          canReroll={pending.canReroll}
        />
      );
    case 'repair':
      return <RepairStep phaseIndex={pending.phaseIndex} outcome={pending.outcome} cost={pending.cost} />;
    case 'handLimit':
      return <HandLimitStep excess={pending.excess} />;
  }
}

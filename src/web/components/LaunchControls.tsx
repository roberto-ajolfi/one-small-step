/**
 * LaunchControls — crew + pre-bid selection for the campaign launch
 * (spec §7 MissionPanel "launch controls: crew slots + pre-bid selection").
 *
 * Every gesture compiles to one `launchMission` move; the button is disabled
 * with the engine's own reason until the selection is complete and legal.
 * Selection is per card *instance* so both copies of a row can be committed.
 */

import { useState } from 'react';
import { cardById, crewSlots, validateMove } from '../../engine';
import type { CardId, Mission } from '../../engine';
import { Badge, Button, CardButton, cardName } from '../ui';
import { useGameSession, useGameState } from '../useGameSession';

interface Candidate {
  key: string;
  id: CardId;
}

export function LaunchControls({ mission }: { mission: Mission }) {
  const session = useGameSession();
  const { state } = useGameState();
  const [crewPicks, setCrewPicks] = useState<string[]>([]);
  const [prebidPicks, setPrebidPicks] = useState<string[]>([]);

  const slots = crewSlots(state, mission.program);

  const crew: Candidate[] = Object.entries(state.crewPool)
    .filter(([id, status]) => status.state === 'ready' && cardById(state.content, id).named?.role !== 'tech')
    .map(([id]) => ({ key: `pool-${id}`, id }));

  const prebid: Candidate[] = [
    ...state.hand.map((id, index) => ({ key: `hand-${index}`, id })),
    ...state.inPlay.map((id, index) => ({ key: `play-${index}`, id })),
  ].filter(({ id }) => cardById(state.content, id).kind === 'equipment');

  const toggle = (list: string[], setList: (next: string[]) => void, key: string, cap?: number) => {
    if (list.includes(key)) {
      setList(list.filter((entry) => entry !== key));
      return;
    }
    if (cap !== undefined && list.length >= cap) return;
    setList([...list, key]);
  };

  const pickedCrew = crewPicks.map((key) => crew.find((c) => c.key === key)?.id).filter(Boolean) as CardId[];
  const pickedPrebid = prebidPicks.map((key) => prebid.find((c) => c.key === key)?.id).filter(Boolean) as CardId[];
  const reason =
    validateMove(state, {
      t: 'launchMission',
      mission: mission.id,
      crew: pickedCrew,
      prebid: pickedPrebid,
    }) ?? undefined;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <h3 className="eyebrow mb-2">
          Crew slots {pickedCrew.length} / {slots}
        </h3>
        {crew.length === 0 ? (
          <p className="text-micro text-ink-faint">
            No ready astronauts in the pool yet — recruit People in identity mode first.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {crew.map(({ key, id }) => {
              const card = cardById(state.content, id);
              return (
                <li key={key}>
                  <CardButton
                    card={card}
                    compact
                    pressed={crewPicks.includes(key)}
                    label={`Assign ${cardName(card)} to the crew`}
                    className="w-32"
                    onClick={() => toggle(crewPicks, setCrewPicks, key, slots)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <h3 className="eyebrow mb-2">
          Pre-bid equipment <Badge tone="muted">optional</Badge>
        </h3>
        {prebid.length === 0 ? (
          <p className="text-micro text-ink-faint">No equipment available to pre-bid.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {prebid.map(({ key, id }) => {
              const card = cardById(state.content, id);
              return (
                <li key={key}>
                  <CardButton
                    card={card}
                    compact
                    pressed={prebidPicks.includes(key)}
                    label={`Pre-bid ${cardName(card)}`}
                    className="w-32"
                    onClick={() => toggle(prebidPicks, setPrebidPicks, key)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon="rocket"
          disabledReason={reason}
          onClick={() => {
            session.dispatch({ t: 'launchMission', mission: mission.id, crew: pickedCrew, prebid: pickedPrebid });
            setCrewPicks([]);
            setPrebidPicks([]);
          }}
        >
          Launch {mission.name}
        </Button>
        <p className="text-micro text-ink-faint">
          The launch is declared now and resolves during the turn's mission step (ruling 29).
        </p>
      </div>
    </div>
  );
}

/**
 * MissionPanel — the current campaign mission (spec §7 MissionPanel: "live
 * phase chain + launch controls").
 *
 * Shows the mission being attempted (or next up), its hardware requirements,
 * the live phase chain, and either the launch controls or the in-flight
 * mission state. Mission windows (pre-bid / ability / repair) are rendered as
 * modal step panels by `PendingWindow`.
 */

import { cardById, missionById } from '../../engine';
import type { GameState, Mission } from '../../engine';
import { Badge, Panel, cardIdentity, cardName } from '../ui';
import { useGameState } from '../useGameSession';
import { LaunchControls } from './LaunchControls';
import { PhaseChain } from './PhaseChain';

/** The mission the panel is about: in flight, declared, or next on the ladder. */
function displayedMission(state: GameState): Mission | null {
  const id = state.mission?.missionId ?? state.pendingLaunch?.missionId;
  if (id) return missionById(state.content, id);
  if (state.campaign.index >= state.content.missions.length) return null;
  return state.content.missions[state.campaign.index];
}

function Requirements({ state, mission }: { state: GameState; mission: Mission }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {mission.requires.map((techId) => {
        const item = state.content.techTree.find((tech) => tech.id === techId);
        const ok = state.tech[techId];
        return (
          <li key={techId}>
            <Badge tone={ok ? 'teal' : 'red'} srLabel={ok ? 'hardware developed' : 'hardware missing'}>
              {item?.name ?? techId}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

export function MissionPanel() {
  const { state } = useGameState();
  const mission = displayedMission(state);
  const active = state.mission;
  const declared = state.pendingLaunch;

  if (!mission) {
    return (
      <Panel title="Mission">
        <p className="p-3 text-micro text-ink-faint">The campaign ladder is complete.</p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Mission"
      note={`${mission.year} \u00b7 ${mission.program}`}
      actions={<Badge tone="gold">VP {mission.vp}</Badge>}
    >
      <div className="flex flex-col gap-3 p-3">
        <div>
          <h3 className="text-title text-ink">{mission.name}</h3>
          {mission.flavor ? <p className="text-micro italic text-ink-faint">{mission.flavor}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="eyebrow">Requires</span>
            <Requirements state={state} mission={mission} />
          </div>
        </div>

        <PhaseChain state={state} mission={mission} active={active} />

        {active ? (
          <div className="border border-ink/20 bg-paper-edge/20 p-3">
            <h3 className="eyebrow mb-2">In flight</h3>
            <p className="text-micro text-ink-soft">
              <strong>Crew:</strong>{' '}
              {active.crew.map((id) => cardName(cardById(state.content, id))).join(', ') || 'none'}
            </p>
            <p className="text-micro text-ink-soft">
              <strong>Tech support:</strong>{' '}
              {active.supportTechs.map((id) => cardName(cardById(state.content, id))).join(', ') || 'none'}
            </p>
            {active.reservedPrebid.length > 0 ? (
              <p className="text-micro text-ink-soft">
                <strong>Pre-bid held:</strong> {active.reservedPrebid.join(', ')}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone={active.kraftUsed ? 'muted' : 'teal'}>Kraft {active.kraftUsed ? 'used' : 'ready'}</Badge>
              <Badge tone={active.rerollUsed ? 'muted' : 'teal'}>Kranz reroll {active.rerollUsed ? 'used' : 'ready'}</Badge>
              <Badge tone="navy">
                phase {Math.min(active.phaseIndex + 1, mission.chain.length)} / {mission.chain.length}
              </Badge>
            </div>
          </div>
        ) : declared ? (
          <div className="border border-ink/20 bg-paper-edge/20 p-3">
            <h3 className="eyebrow mb-2">Declared this turn</h3>
            <p className="text-micro text-ink-soft">
              {declared.crew
                .map((id) => {
                  const card = state.content.cards.find((c) => c.id === id);
                  return card ? `${cardName(card)} (${cardIdentity(card)})` : id;
                })
                .join(' \u00b7 ')}
            </p>
            {declared.reservedPrebid.length > 0 ? (
              <p className="text-micro text-ink-soft">Pre-bid reserved: {declared.reservedPrebid.join(', ')}</p>
            ) : null}
            <p className="text-micro text-ink-faint">Resolves at the end of the turn (ruling 29).</p>
          </div>
        ) : (
          <LaunchControls key={`${state.seed}-${mission.id}`} mission={mission} />
        )}
      </div>
    </Panel>
  );
}

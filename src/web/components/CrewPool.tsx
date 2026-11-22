/**
 * CrewPool — the 16 named people (8 astronauts + 8 techs) with their
 * Ready/Injured/Stunned boxes (spec §7 "CrewPool (16 R/I/S slots)", kit p.4).
 *
 * Playing a Person card in identity mode recruits them permanently (FR6.1);
 * injured members sit out two launches and stunned one, healing at year end.
 */

import type { Card, CrewStatus } from '../../engine';
import { Badge, Icon, Panel, abilityLabel } from '../ui';
import { useGameState } from '../useGameSession';

const STATUS_WORDS: Record<CrewStatus['state'], string> = {
  ready: 'Ready',
  injured: 'Injured',
  stunned: 'Stunned',
};

function StatusBoxes({ status }: { status?: CrewStatus }) {
  const states: CrewStatus['state'][] = ['ready', 'injured', 'stunned'];
  const active = status?.state;
  return (
    <span className="flex gap-0.5" role="img" aria-label={`Status: ${active ? STATUS_WORDS[active] : 'not recruited'}`}>
      {states.map((state) => {
        const on = active === state;
        return (
          <span
            key={state}
            title={STATUS_WORDS[state]}
            className={[
              'flex h-6 w-6 items-center justify-center border text-micro font-semibold',
              on ? 'border-patch-navy bg-patch-navy text-paper' : 'border-ink/25 text-ink-faint',
            ].join(' ')}
          >
            {state[0].toUpperCase()}
          </span>
        );
      })}
    </span>
  );
}

function CrewRow({ card }: { card: Card }) {
  const { state } = useGameState();
  const name = card.named?.name ?? card.id;
  const role = card.named?.role;
  const status = state.crewPool[card.id];
  const flying =
    state.mission?.crew.includes(card.id) ?? state.pendingLaunch?.crew.includes(card.id) ?? false;
  const supporting = state.mission?.supportTechs.includes(card.id) ?? false;

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 border border-ink/15 px-2 py-1.5">
      <Icon name={role === 'astronaut' ? 'users' : 'flask'} size={14} className="text-ink-faint" />
      <div className="min-w-0 grow">
        <p className="truncate font-display text-xs text-ink">{name}</p>
        <p className="truncate text-micro text-ink-faint">
          {card.named?.abilities.map(abilityLabel).join(' \u00b7 ') || 'no special ability'}
        </p>
      </div>
      {flying ? <Badge tone="navy">on mission</Badge> : null}
      {supporting ? <Badge tone="teal">supporting</Badge> : null}
      {!status ? <Badge tone="muted">not recruited</Badge> : null}
      {status && status.state !== 'ready' ? (
        <Badge tone="red">{status.launchesLeft} launch(es) out</Badge>
      ) : null}
      <StatusBoxes status={status} />
    </li>
  );
}

export function CrewPool() {
  const { state } = useGameState();
  const people = state.content.cards.filter((card) => card.named);
  const astronauts = people.filter((card) => card.named?.role === 'astronaut');
  const techs = people.filter((card) => card.named?.role === 'tech');

  return (
    <Panel
      title="Crew pool"
      note={`${Object.keys(state.crewPool).length} recruited`}
      collapsible
      defaultOpen={false}
    >
      <div className="grid grid-cols-1 gap-2 p-3 lg:grid-cols-2">
        <div>
          <h3 className="eyebrow mb-1">Astronauts</h3>
          <ul className="flex flex-col gap-1">
            {astronauts.map((card) => (
              <CrewRow key={card.id} card={card} />
            ))}
          </ul>
        </div>
        <div>
          <h3 className="eyebrow mb-1">Techs (never fly)</h3>
          <ul className="flex flex-col gap-1">
            {techs.map((card) => (
              <CrewRow key={card.id} card={card} />
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

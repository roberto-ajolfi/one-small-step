/**
 * Printable-kit generator — content JSON → the four kit pages (spec §5).
 *
 * Renders the mapping table, game board, scorepad and mission-status sheet
 * from the `src/data` bundle alone (spec §3 dependency rules) as one
 * standalone HTML document for browser print-to-PDF. `proposals/…kit.html` is
 * the visual golden reference: layout and prose live in `template.ts`, while
 * every number, name and row here is derived from the JSON content — so the
 * printed kit cannot drift from the engine's data (spec §12).
 *
 * Run `npm run print` to write the document into `dist/`; everything except
 * the CLI entry at the bottom is pure (spec §8.1).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { content } from '../data';
import {
  CHAIN_ABBREV,
  CHECK,
  CREW_DEV_LABELS,
  CREW_TECH_ORDER,
  DOMAIN_LABELS,
  EVENT_SHORT_NAMES,
  JOKER_MARKS,
  LOG_ROWS,
  MILESTONE_NAMES,
  MISSION_NOTE_SUFFIX,
  PROGRAM_INITIALS,
  SCOREPAD_NAMES,
  START_YEAR,
  SUIT_HEADING,
  SUIT_SYMBOL,
  TECH_CAPTIONS,
  TRACK_SPACES_PER_ROW,
  YEAR_COUNT,
  biteBox,
  cardLegend,
  crewReminderNote,
  difficultyBox,
  endRemindersBox,
  esc,
  h2,
  kitDocument,
  namedBandNote,
  page,
  table,
  td,
  techUnlockNote,
  th,
  tr,
  turnSequenceBox,
} from './template';

type Bundle = typeof content;
type Card = Bundle['cards'][number];
type Mission = Bundle['missions'][number];
type TechItem = Bundle['techTree'][number];
type EventEntry = Bundle['events'][number];
type Tuning = Bundle['tuning'];
type Ability = NonNullable<Card['named']>['abilities'][number];
type EventEffect = EventEntry['effects'][number];

const DASH = '\u2014'; // —
const MINUS = '\u2212'; // −
const EN_DASH = '\u2013'; // –

// ---------------------------------------------------------------------------
// Small derivations shared by the pages
// ---------------------------------------------------------------------------

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Signed display of a modifier: `+6`, `−2` (kit typography uses U+2212). */
function signed(n: number): string {
  return n < 0 ? `${MINUS}${Math.abs(n)}` : `+${n}`;
}

/** Mission name without its trailing parenthetical: "Apollo 11 (Moon)" → "Apollo 11". */
function shortMissionName(mission: Mission): string {
  return mission.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** The tech table's note spelling ("Gemini 8 (docking)"). */
function noteMissionName(mission: Mission): string {
  const suffix = MISSION_NOTE_SUFFIX[mission.id];
  return suffix ? `${shortMissionName(mission)} ${suffix}` : shortMissionName(mission);
}

/** The game's Moon mission: the last rung of the ladder (FR5.1). */
function moonMission(bundle: Bundle): Mission {
  return bundle.missions[bundle.missions.length - 1];
}

function checkCell(cls = 'num'): string {
  return td(CHECK, cls);
}

// ---------------------------------------------------------------------------
// Card reference (kit p.1)
// ---------------------------------------------------------------------------

/** Card label column: "10♥", or "Joker ●" for the two event rows. */
function cardLabel(card: Card): string {
  if (card.kind === 'event') return `Joker ${JOKER_MARKS[card.id] ?? ''}`;
  return `${card.rank}${SUIT_SYMBOL[card.suit] ?? ''}`;
}

/**
 * One-line kit phrasing of an ability (shapes are fixed, numbers are data).
 * The kit writes astronauts' phase boosts as "+2 to Launch" but techs' mission
 * support as "+1 Lunar Orbit" (no "to") — `phaseTo` picks the variant.
 */
function abilityText(ability: Ability, phaseTo = true): string {
  switch (ability.kind) {
    case 'phaseBoost': {
      const where =
        ability.phases === 'all'
          ? 'every phase'
          : ability.phases.map((phase) => phase).join(' & ');
      return `+${ability.amount} ${phaseTo ? 'to ' : ''}${where}`;
    }
    case 'devDiscount': {
      const scope =
        ability.domains === 'any'
          ? ability.perTurn
            ? ' /turn'
            : ' any purchase'
          : ` on ${ability.domains.map((domain) => DOMAIN_LABELS[domain] ?? domain).join('/')}`;
      return `Dev ${MINUS}${ability.amount} R&D${scope}`;
    }
    case 'kraft':
      return `once/mission: +${ability.amount} to any one phase`;
    case 'reroll':
      return 'once/mission: reroll one failed phase draw';
    case 'crewBonusAdd':
      return `+${ability.amount} to all crew bonuses`;
    case 'phaseDrawAdd':
      return `+${ability.amount} to every phase draw`;
    case 'yearEndMoney':
      return `+${ability.amount} Money at year-end`;
    case 'firstMissionDifficulty':
      return `${signed(ability.amount)} difficulty to first mission of each program`;
  }
}

/** Identity-mode column: dev discounts stay plain, the rest reads bold (kit p.1). */
function abilityHtml(ability: Ability, phaseTo = true): string {
  const text = esc(abilityText(ability, phaseTo));
  return ability.kind === 'devDiscount' ? text : `<b>${text}</b>`;
}

function identityHtml(card: Card): string {
  if (card.named) {
    const person = `<b>${esc(card.named.name)}</b>`;
    // Named band rows outside hearts are printed as "(Person)" (kit p.1).
    return card.suit === 'H' ? person : `${person} (Person)`;
  }
  if (card.sideMission) return esc(`Side Mission: ${card.sideMission.name}`);
  if (card.kind === 'event') return 'News Event';
  return esc(card.flavor ?? card.id);
}

function identityModeHtml(card: Card, t: Tuning): string {
  const v = card.values;
  if (card.kind === 'event') return 'On draw: roll d6 on Event Table (page 2), then discard';
  if (card.sideMission) {
    return esc(`Fly vs ${t.sideMissionDifficulty}: VP +${t.sideMissionVp} & ${abilityText(card.sideMission.perk)}`);
  }
  if (card.kind === 'bonus') return `Bonus +${v.bonus}`;
  if (card.kind === 'equipment') return `Repair ${v.repair} \u00b7 pre-bid +${v.repair}`;
  if (card.kind === 'action') return '+1 action this turn';
  const crew = `Crew +${v.crew}`;
  const burn = `burn ${v.repair}`;
  if (!card.named) return `${crew} \u00b7 ${burn}`;
  const phaseTo = card.named.role !== 'tech';
  const abilities = card.named.abilities.map((ability) => abilityHtml(ability, phaseTo)).join(' \u00b7 ');
  // Techs flex onto development and never burn for repair (FR6.3).
  return card.named.role === 'tech' ? `${crew} \u00b7 ${abilities}` : `${crew} \u00b7 ${abilities} \u00b7 ${burn}`;
}

function valueCells(card: Card): string {
  if (card.kind === 'event') return td(DASH, 's') + td(DASH, 'num') + td(DASH, 'num');
  return td(String(card.s), 's') + td(String(card.values.money), 'num') + td(String(card.values.rd), 'num');
}

function cardRow(card: Card, t: Tuning): string {
  return tr(td(esc(cardLabel(card)), 'card') + td(identityHtml(card)) + valueCells(card) + td(identityModeHtml(card, t)));
}

const CARD_HEADER = tr(
  th('Card', 'card') + th('Identity') + th('s', 's') + th('$', 'num') + th('R&D', 'num') + th('Identity mode'),
);

function cardTable(cards: Card[], t: Tuning): string {
  return table(CARD_HEADER, ...cards.map((card) => cardRow(card, t)));
}

function page1(bundle: Bundle): string {
  const bySuit = (suit: string) => bundle.cards.filter((card) => card.suit === suit);
  const suitSection = (suit: string) => h2(SUIT_HEADING[suit]) + cardTable(bySuit(suit), bundle.tuning);
  const rows = bundle.cards.length;
  return page({
    heading: 'One Small Step',
    subtitle: `Card Reference \u00b7 ${rows}-row mapping table \u00b7 2 identical decks = ${rows * 2} cards`,
    body: [
      cardLegend(),
      '<div class="grid2">',
      '    <div>',
      suitSection('H'),
      suitSection('D'),
      '    </div>',
      '    <div>',
      suitSection('S'),
      suitSection('C'),
      suitSection('JOKER'),
      namedBandNote(),
      '    </div>',
      '</div>',
    ].join('\n  '),
    pageNo: 1,
    pageLabel: 'Card Reference',
  });
}

// ---------------------------------------------------------------------------
// Game board (kit p.2)
// ---------------------------------------------------------------------------

/** "Required by …" note: all-of-program, a name-number range, or the name list. */
function requiredByNote(item: TechItem, missions: Mission[]): string {
  const requiring = missions.filter((m) => m.requires.includes(item.id));
  if (requiring.length === 0) return DASH;
  const program = requiring[0].program;
  const wholeProgram =
    requiring.every((m) => m.program === program) &&
    requiring.length === missions.filter((m) => m.program === program).length;
  if (wholeProgram) return `Required by all ${capitalize(program)} missions`;

  // Consecutive same-program rungs with a shared name prefix read as a range
  // ("Apollo 8–11"); anything shorter lists its mission names.
  const prefix = shortMissionName(requiring[0]).replace(/\s+\d+$/, '');
  const numbered = requiring.every((m) => new RegExp(`^${prefix} \\d+$`).test(shortMissionName(m)));
  const consecutive = requiring.every(
    (m, i) => i === 0 || missions.indexOf(m) === missions.indexOf(requiring[i - 1]) + 1,
  );
  if (requiring.length >= 3 && numbered && consecutive) {
    const first = shortMissionName(requiring[0]).match(/\d+$/)?.[0];
    const last = shortMissionName(requiring[requiring.length - 1]).match(/\d+$/)?.[0];
    return `Required by ${prefix} ${first}${EN_DASH}${last}`;
  }
  return `Required by ${requiring.map(noteMissionName).join(' / ')}`;
}

function techRow(item: TechItem, missions: Mission[]): string {
  const caption = TECH_CAPTIONS[item.id];
  const hardware = caption
    ? caption.suffix
      ? `<b>${esc(caption.lead)}</b> ${esc(caption.suffix)}`
      : `<b>${esc(caption.lead)}</b>`
    : `<b>${esc(item.name)}</b>`;
  return tr(
    td(CHECK) +
      td(hardware) +
      td(capitalize(item.program)) +
      td(String(item.rdCost), 'num') +
      td(String(item.moneyCost), 'num') +
      td(esc(requiredByNote(item, missions))),
  );
}

/** Track heading names the drift and every Soviet push (tuning + event table). */
function trackHeading(t: Tuning, events: EventEntry[]): string {
  const shifts = events.flatMap((event) =>
    event.effects
      .filter((effect): effect is Extract<EventEffect, { type: 'sovietShift' }> => effect.type === 'sovietShift')
      .map((effect) => ({ face: event.face, amount: effect.amount })),
  );
  const ups = shifts
    .filter((shift) => shift.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map((shift) => signed(shift.amount))
    .join('/');
  const down = shifts.filter((shift) => shift.amount < 0).sort((a, b) => a.amount - b.amount)[0];
  const setback = down ? `, ${EVENT_SHORT_NAMES[down.face] ?? `event ${down.face}`} ${signed(down.amount)}` : '';
  return `Soviet Track \u2014 drift +${t.sovietDrift}/turn \u00b7 pushes: events ${ups}, ` +
    `mission failure +${t.sovietPushFailure}${setback}`;
}

function trackRow(spaces: number[], t: Tuning): string {
  const cells = spaces
    .map((space) => {
      const cls =
        space === t.sovietTrackLength ? 'space final' : space % t.milestoneEvery === 0 ? 'space ms' : 'space';
      return `<div class="${cls}">${space}</div>`;
    })
    .join('');
  const labels = spaces
    .filter((space) => space % t.milestoneEvery === 0)
    .map(
      (space) =>
        `<div class="mslabel">${space}: ${esc(MILESTONE_NAMES[space] ?? `Milestone ${space}`)}</div>`,
    )
    .join('');
  return `<div class="track">${cells}</div>\n  <div class="mslabels">${labels}</div>`;
}

function track(t: Tuning): string {
  const spaces = Array.from({ length: t.sovietTrackLength }, (_, i) => i + 1);
  const rows: string[] = [];
  for (let i = 0; i < spaces.length; i += TRACK_SPACES_PER_ROW) {
    rows.push(trackRow(spaces.slice(i, i + TRACK_SPACES_PER_ROW), t));
  }
  return rows.join('\n  ');
}

function effectText(effect: EventEffect): string {
  switch (effect.type) {
    case 'sovietShift':
      return `Soviet track ${signed(effect.amount)}`;
    case 'rdGain':
      return `+${effect.amount} R&D`;
    case 'moneyGain':
      return `+${effect.amount} Money`;
    case 'loseActions':
      return `Lose ${effect.amount} actions next turn`;
    case 'stunCrew':
      return `all crew stunned ${effect.launches} mission launch${effect.launches === 1 ? '' : 's'}`;
  }
}

function eventRow(event: EventEntry): string {
  return tr(
    td(String(event.face), 'num') +
      td(`<b>${esc(event.name)}</b>`) +
      td(esc(event.effects.map(effectText).join('; '))),
  );
}

function page2(bundle: Bundle): string {
  const { tuning: t, missions, techTree, events } = bundle;
  const moon = moonMission(bundle);
  const programBase = (['mercury', 'gemini', 'apollo'] as const)
    .map((program) => `${capitalize(program)} ${t.programDifficulty[program]}`)
    .join(' \u00b7 ');
  // The kit's difficulty reference lists the campaign phases; Descent (flown
  // only by Apollo 10) is folded into the apollo base like the draft does.
  const phaseOffsets = (
    Object.entries(t.phaseOffsets) as [string, number][]
  )
    .filter(([phase]) => phase !== 'Descent')
    .map(([phase, offset]) => `${phase} ${offset === 0 ? '0' : signed(offset)}`)
    .join(' \u00b7 ');
  const moneySpaces = Array.from(
    { length: Math.floor(t.sovietTrackLength / t.moneyBiteEvery) },
    (_, i) => (i + 1) * t.moneyBiteEvery,
  ).join(', ');
  return page({
    heading: 'Game Board',
    subtitle: 'Tech Tree \u00b7 Soviet Track \u00b7 Event Table \u00b7 Difficulty Reference',
    body: [
      h2('Tech Tree \u2014 dual cost: R&D (design) + Money (production)'),
      table(
        tr(
          '<th style="width:6mm"></th>' +
            th('Hardware') +
            th('Program') +
            th('R&D', 'num') +
            th('Money', 'num') +
            th('Notes'),
        ),
        ...techTree.map((item) => techRow(item, missions)),
      ),
      techUnlockNote(),
      h2(trackHeading(t, events)),
      track(t),
      biteBox({
        vpBite: t.milestoneVpBite,
        moneyEvery: t.moneyBiteEvery,
        moneySpaces,
        moneyBite: t.milestoneMoneyBite,
        moonName: shortMissionName(moon),
        trackLength: t.sovietTrackLength,
      }),
      h2('Event Table \u2014 roll d6 when a Joker is drawn'),
      table(
        tr(th('d6', 'num') + th('Event') + th('Effect')),
        ...events.map((event) => eventRow(event)),
      ),
      h2('Phase Difficulty Reference'),
      difficultyBox({
        programBase,
        phaseOffsets,
        finalBonus: t.finalMissionBonus,
        retryPenalty: t.retryPenalty,
        repairMinor: t.repairCostMinor,
        repairMajor: t.repairCostMajor,
      }),
    ].join('\n  '),
    pageNo: 2,
    pageLabel: 'Game Board',
  });
}

// ---------------------------------------------------------------------------
// Scorepad (kit p.3)
// ---------------------------------------------------------------------------

function scorepadRow(labelHtml: string, max: string, cells: string): string {
  return tr(td(labelHtml) + td(max, 'num') + cells);
}

function page3(bundle: Bundle): string {
  const { tuning: t, missions, cards } = bundle;
  const aces = cards.filter((card) => card.kind === 'sideMission');
  const moon = moonMission(bundle);
  const gameCells = td('') + td('') + td('');
  const countCells = td('\u00d7 ____') + td('\u00d7 ____') + td('\u00d7 ____'); // ×
  const missionRows = missions.map((mission, index) =>
    scorepadRow(
      (() => {
        const label = `${index + 1}. ${SCOREPAD_NAMES[mission.id] ?? mission.name}`;
        return mission === moon ? `<b>${esc(label)}</b>` : esc(label);
      })(),
      String(mission.vp),
      gameCells,
    ),
  );
  const sideRows = aces.map((ace) =>
    scorepadRow(esc(`Side Mission: ${ace.sideMission!.name}`), String(t.sideMissionVp), gameCells),
  );
  const programRows = (['mercury', 'gemini', 'apollo'] as const).map((program) =>
    scorepadRow(`Program bonus: ${capitalize(program)} complete`, String(t.programBonuses[program]), gameCells),
  );
  const maxTotal =
    missions.reduce((sum, mission) => sum + mission.vp, 0) +
    aces.length * t.sideMissionVp +
    t.programBonuses.mercury +
    t.programBonuses.gemini +
    t.programBonuses.apollo;
  return page({
    heading: 'Scorepad',
    subtitle: 'Three games per sheet \u00b7 VP ledger \u00b7 victory tiers',
    body: [
      table(
        tr(
          '<th style="width:52mm">Scoring line</th>' +
            th('Max') +
            '<th style="width:32mm">Game 1</th>' +
            '<th style="width:32mm">Game 2</th>' +
            '<th style="width:32mm">Game 3</th>',
        ),
        ...missionRows,
        ...sideRows,
        ...programRows,
        scorepadRow(`Failed attempts (${MINUS}1 each)`, MINUS, countCells),
        scorepadRow(`Soviet milestone bites (${MINUS}${t.milestoneVpBite} VP each)`, MINUS, countCells),
        scorepadRow('<b>TOTAL SCORE</b>', String(maxTotal), td('<b></b>') + td('<b></b>') + td('<b></b>')),
      ),
      h2('Victory Tiers'),
      tierTable(t, moon),
      endRemindersBox({
        phases: moon.chain.length,
        moonName: shortMissionName(moon),
        totalTurns: t.turnsPerYear * YEAR_COUNT,
        trackLength: t.sovietTrackLength,
      }),
      '<div class="gap"></div>',
      h2('Game Log (optional)'),
      table(
        tr('<th style="width:12mm">Turn</th>' + '<th style="width:14mm">Year</th>' + th('Notes \u2014 missions flown, events, milestone bites')),
        ...Array.from({ length: LOG_ROWS }, () => tr(td('') + td('') + td(''))),
      ),
    ].join('\n  '),
    pageNo: 3,
    pageLabel: 'Scorepad',
  });
}

function tierTable(t: Tuning, moon: Mission): string {
  const moonTier = t.tierThresholds.moon;
  const timeoutTier = t.tierThresholds.timedOut;
  return `<table class="tier">
        ${tr(th('Ending') + th('Score') + th('Tier'))}
        ${tr(`<td rowspan="3"><b>Moon landing</b><br>(${esc(shortMissionName(moon))} splashdown)</td>` + td(`\u2265 ${moonTier.distinguished}`) + td('<b>Distinguished Service Medal</b>'))}
        ${tr(td(`${moonTier.administrator}${EN_DASH}${moonTier.distinguished - 1}`) + td('<b>NASA Administrator</b>'))}
        ${tr(td(esc(`< ${moonTier.administrator}`)) + td('<b>Mission Accomplished</b>'))}
        ${tr(`<td rowspan="3"><b>Timed out</b><br>(turn ${t.turnsPerYear * YEAR_COUNT}, no landing)</td>` + td(`\u2265 ${timeoutTier.honorable}`) + td('<b>Honorable Mention</b>'))}
        ${tr(td(`${timeoutTier.good}${EN_DASH}${timeoutTier.honorable - 1}`) + td('<b>Good Effort</b>'))}
        ${tr(td(esc(`< ${timeoutTier.good}`)) + td('<b>Budget Overrun</b>'))}
        ${tr(td('<b>Soviets land first</b>') + td(DASH) + td('<b>Total Loss</b> (no score honored)'))}
      </table>`;
}

// ---------------------------------------------------------------------------
// Mission status sheet (kit p.4)
// ---------------------------------------------------------------------------

/** The ladder's chain column: the always-flown bookends, else the new phases. */
function chainCell(mission: Mission): string {
  const bookends = ['Pre-launch', 'Launch', 'Reentry', 'Splashdown'];
  const middle = mission.chain.filter((phase) => !bookends.includes(phase));
  if (middle.length === 0) return bookends.map((phase) => CHAIN_ABBREV[phase] ?? phase).join(' \u2192 ');
  return `+ ${middle.join(', ')}`;
}

function techShort(bundle: Bundle, techId: string): string {
  const caption = TECH_CAPTIONS[techId];
  if (caption) return caption.short;
  return bundle.techTree.find((item) => item.id === techId)?.name ?? techId;
}

function isFinalOfProgram(bundle: Bundle, mission: Mission): boolean {
  const ofProgram = bundle.missions.filter((m) => m.program === mission.program);
  return ofProgram[ofProgram.length - 1] === mission;
}

function ladderRow(bundle: Bundle, mission: Mission, index: number): string {
  const label = index === bundle.missions.length - 1 ? `<b>${esc(mission.name)}</b>` : esc(mission.name);
  const finalMark = isFinalOfProgram(bundle, mission)
    ? ` <i>(final ${PROGRAM_INITIALS[mission.program] ?? mission.program})</i>`
    : '';
  return tr(
    td(String(index + 1), 'num') +
      td(label + finalMark) +
      td(String(mission.year % 100), 'num') +
      td(chainCell(mission)) +
      td(esc(mission.requires.map((id) => techShort(bundle, id)).join(' + '))) +
      td(String(mission.vp), 'num') +
      checkCell() +
      checkCell() +
      checkCell(),
  );
}

function sideMissionRow(ace: Card, t: Tuning): string {
  return tr(
    td(`${SUIT_SYMBOL[ace.suit] ?? ''}${ace.rank}`, 'num') +
      td(esc(`Side Mission: ${ace.sideMission!.name}`)) +
      td(DASH, 'num') +
      td(`1 draw vs ${t.sideMissionDifficulty}`) +
      td(DASH) +
      td(String(t.sideMissionVp), 'num') +
      checkCell() +
      checkCell() +
      checkCell(),
  );
}

/** Compact crew-pool phrasing: "rockets / +1 Launch", "+2 any one phase /mission". */
function crewLabel(card: Card): string {
  return card
    .named!.abilities.map((ability) => {
      switch (ability.kind) {
        case 'devDiscount':
          return (
            CREW_DEV_LABELS[card.id] ??
            (ability.domains === 'any'
              ? `${MINUS}${ability.amount} any`
              : ability.domains.map((domain) => DOMAIN_LABELS[domain] ?? domain).join('/'))
          );
        case 'phaseBoost':
          return `+${ability.amount} ${ability.phases === 'all' ? 'every phase' : ability.phases.join(' & ')}`;
        case 'kraft':
          return `+${ability.amount} any one phase /mission`;
        case 'reroll':
          return 'reroll 1 failed draw /mission';
        default:
          return abilityText(ability);
      }
    })
    .join(' / ');
}

function crewRow(card: Card): string {
  return tr(td(esc(`${card.named!.name} \u00b7 ${crewLabel(card)}`)) + checkCell() + checkCell() + checkCell());
}

function crewTables(bundle: Bundle): string {
  const people = bundle.cards.filter((card) => card.named);
  const astronauts = people.filter((card) => card.named!.role === 'astronaut');
  const techs = people
    .filter((card) => card.named!.role === 'tech')
    .sort((a, b) => CREW_TECH_ORDER.indexOf(a.id) - CREW_TECH_ORDER.indexOf(b.id));
  const header = (title: string) => tr(th(title) + th('R', 'num') + th('I', 'num') + th('S', 'num'));
  return `<div class="grid2">
    <div>
      ${table(header('Astronaut'), ...astronauts.map(crewRow))}
    </div>
    <div>
      ${table(header('Tech (dev OR mission support)'), ...techs.map(crewRow))}
    </div>
  </div>`;
}

function turnTracker(t: Tuning): string {
  const turns = Array.from({ length: t.turnsPerYear }, (_, i) => i + 1);
  const blanks = turns.map(() => '____').join(' / ');
  return `<table class="turngrid">
        ${tr(th('Year') + turns.map((turn) => th(`Turn ${turn}`, 'num')).join('') + th(`Soviet space (0${EN_DASH}${t.sovietTrackLength})`))}
        ${Array.from({ length: YEAR_COUNT }, (_, year) =>
          tr(
            td(String(START_YEAR + year)) +
              turns.map(() => checkCell('cb')).join('') +
              td(blanks),
          ),
        ).join('\n        ')}
      </table>`;
}

function page4(bundle: Bundle): string {
  const { tuning: t, missions, cards } = bundle;
  const aces = cards.filter((card) => card.kind === 'sideMission');
  const crewSlots = (['mercury', 'gemini', 'apollo'] as const)
    .map((program) => `${capitalize(program)} ${t.crewSlots[program]}`)
    .join(', ');
  return page({
    heading: 'Mission Status Sheet',
    subtitle: 'Campaign ladder \u00b7 crew pool \u00b7 turn tracker',
    body: [
      h2('Turn Sequence'),
      turnSequenceBox({
        draws: t.drawPerTurn,
        actions: t.actionsPerTurn,
        drift: t.sovietDrift,
        turnsPerYear: t.turnsPerYear,
        handLimit: t.handLimit,
      }),
      h2(`Campaign Ladder \u2014 fly in order; failed missions retry at +${t.retryPenalty} difficulty`),
      table(
        tr(
          th('#', 'num') +
            th('Mission') +
            th('Yr', 'num') +
            th('Phase chain') +
            th('Requires') +
            th('VP', 'num') +
            th('Fly', 'num') +
            th('Fail \u00d7', 'num') +
            th('Done', 'num'),
        ),
        ...missions.map((mission, index) => ladderRow(bundle, mission, index)),
        ...aces.map((ace) => sideMissionRow(ace, t)),
      ),
      h2(
        `Crew Pool \u2014 R = ready \u00b7 I = injured (${t.crewInjuryLaunches} launches) ` +
          `\u00b7 S = stunned (${t.crewStunLaunches} launch${t.crewStunLaunches === 1 ? '' : 's'})`,
      ),
      crewTables(bundle),
      h2('Turn Tracker \u2014 Soviet position at end of each turn'),
      turnTracker(t),
      crewReminderNote({
        handLimit: t.handLimit,
        crewSlots,
        repairMinor: t.repairCostMinor,
        repairMajor: t.repairCostMajor,
      }),
    ].join('\n  '),
    pageNo: 4,
    pageLabel: 'Mission Status',
  });
}

// ---------------------------------------------------------------------------
// Assembly + CLI
// ---------------------------------------------------------------------------

/** Renders the full four-page kit as one standalone HTML document. */
export function renderKit(bundle: Bundle = content): string {
  return kitDocument(
    [page1(bundle), page2(bundle), page3(bundle), page4(bundle)].join('\n\n'),
  );
}

/** Writes the kit document (the CLI edge — everything above is pure). */
export function writeKit(outPath: string, bundle: Bundle = content): void {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, renderKit(bundle), 'utf8');
}

export const DEFAULT_KIT_PATH = 'dist/one-small-step-printable-kit.html';

function main(): void {
  const argv = process.argv.slice(2);
  let outPath = DEFAULT_KIT_PATH;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) outPath = argv[++i];
    else throw new Error(`usage: npm run print -- [--out FILE]\n  --out FILE   output path (default ${DEFAULT_KIT_PATH})`);
  }
  writeKit(outPath);
  console.log(`wrote ${outPath} — open it in a browser and print to PDF`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

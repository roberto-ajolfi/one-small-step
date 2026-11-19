/**
 * Test content fixture — the full ruleset as a hand-built Content bundle (M1).
 *
 * Builds the 54-row mapping table from the design doc's hybrid skeleton
 * (FR1.2: suit → identity mode, rank → s, named bands) plus the named
 * assignments printed in the kit draft (proposals/…printable-kit.html p.1),
 * the 12-mission ladder (FR5.1 + kit p.4 chains), the 11-item tech tree
 * (FR4.2), the d6 event table (FR9.2) and every tuning constant.
 *
 * M2 replaces this with `src/data/*.json` + zod schemas; cross-reference tests
 * keep the JSON equivalent to these rules.
 */

import type {
  Ability,
  Card,
  Content,
  EventEntry,
  Mission,
  PhaseName,
  Program,
  Rank,
  TechItem,
  Tuning,
} from '../../src/engine/content';

// --- named people (kit p.1, FR6.2/FR6.6) ---------------------------------

const NAMED: Record<string, { name: string; role: 'astronaut' | 'tech'; abilities: Ability[] }> = {
  '9H': { name: 'Alan Shepard', role: 'astronaut', abilities: [{ kind: 'phaseBoost', phases: ['Launch'], amount: 2 }] },
  '10H': { name: 'John Glenn', role: 'astronaut', abilities: [{ kind: 'phaseBoost', phases: ['Orbit'], amount: 2 }] },
  JH: { name: 'Gus Grissom', role: 'astronaut', abilities: [{ kind: 'phaseBoost', phases: 'all', amount: 1 }] },
  QH: { name: 'Ed White', role: 'astronaut', abilities: [{ kind: 'phaseBoost', phases: ['EVA'], amount: 2 }] },
  KH: { name: 'Neil Armstrong', role: 'astronaut', abilities: [{ kind: 'phaseBoost', phases: ['Landing', 'Ascent'], amount: 2 }] },
  JD: { name: 'Frank Borman', role: 'astronaut', abilities: [{ kind: 'phaseBoost', phases: ['TLI/Coast'], amount: 2 }] },
  QD: { name: 'Buzz Aldrin', role: 'astronaut', abilities: [{ kind: 'phaseBoost', phases: ['Rendezvous', 'EVA'], amount: 2 }] },
  KD: { name: 'Michael Collins', role: 'astronaut', abilities: [{ kind: 'phaseBoost', phases: ['Lunar Orbit', 'Reentry'], amount: 2 }] },
  '9C': { name: 'Max Faget', role: 'tech', abilities: [
    { kind: 'devDiscount', domains: ['csm', 'mercury', 'gemini'], amount: 2 },
    { kind: 'phaseBoost', phases: ['Reentry'], amount: 1 },
  ] },
  '10C': { name: 'Robert Gilruth', role: 'tech', abilities: [
    { kind: 'devDiscount', domains: ['capsule'], amount: 2 },
    { kind: 'phaseBoost', phases: ['Splashdown'], amount: 1 },
  ] },
  JC: { name: 'Kurt Debus', role: 'tech', abilities: [
    { kind: 'devDiscount', domains: 'any', amount: 1 },
    { kind: 'phaseBoost', phases: ['Pre-launch'], amount: 2 },
  ] },
  QC: { name: 'Chris Kraft', role: 'tech', abilities: [{ kind: 'kraft', amount: 2 }] },
  KC: { name: 'Gene Kranz', role: 'tech', abilities: [{ kind: 'reroll' }] },
  JS: { name: 'John Houbolt', role: 'tech', abilities: [
    { kind: 'devDiscount', domains: ['lm', 'agena'], amount: 2 },
    { kind: 'phaseBoost', phases: ['Lunar Orbit'], amount: 1 },
  ] },
  QS: { name: 'Margaret Hamilton', role: 'tech', abilities: [
    { kind: 'devDiscount', domains: 'any', amount: 2, perTurn: true },
    { kind: 'phaseBoost', phases: ['Landing', 'Reentry'], amount: 2 },
  ] },
  KS: { name: 'Wernher von Braun', role: 'tech', abilities: [
    { kind: 'devDiscount', domains: ['propulsion'], amount: 2 },
    { kind: 'phaseBoost', phases: ['Launch'], amount: 1 },
  ] },
};

const SIDE_MISSIONS: Record<string, { name: string; perk: Ability }> = {
  AH: { name: 'The New Nine', perk: { kind: 'crewBonusAdd', amount: 1 } },
  AD: { name: 'Telstar', perk: { kind: 'yearEndMoney', amount: 2 } },
  AS: { name: 'Deep Space Network', perk: { kind: 'phaseDrawAdd', amount: 1 } },
  AC: { name: 'Unmanned Test Program', perk: { kind: 'firstMissionDifficulty', amount: -1 } },
};

// --- skeleton derivation (FR1.2) ------------------------------------------

const SUITS = ['H', 'D', 'S', 'C'] as const;
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A'];

function strength(rank: Rank): number {
  if (rank === 'A') return 12;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return rank as number;
}

function valuesFor(kind: Card['kind'], s: number): Card['values'] {
  const base = { money: s, rd: Math.ceil(s / 2) };
  if (kind === 'person') return { ...base, crew: Math.ceil(s / 3), repair: s };
  if (kind === 'equipment') return { ...base, repair: s };
  if (kind === 'bonus') return { ...base, bonus: Math.ceil(s / 2) };
  return base;
}

/** Suit → default identity mode; the named band overrides it (FR1.2). */
function kindFor(suit: string, rank: Rank, id: string): Card['kind'] {
  if (NAMED[id]) return 'person';
  if (rank === 'A') return 'sideMission';
  switch (suit) {
    case 'H':
      return 'person'; // 2–8 generic crew (9+ are named astronauts)
    case 'D':
      return 'bonus';
    case 'S':
      return 'equipment';
    case 'C':
      return 'action';
    default:
      throw new Error(`unexpected suit ${suit}`);
  }
}

function buildCards(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const id = `${rank}${suit}`;
      const s = strength(rank);
      const kind = kindFor(suit, rank, id);
      const named = NAMED[id];
      const sideMission = SIDE_MISSIONS[id];
      cards.push({
        id,
        suit: suit as Card['suit'],
        rank,
        s,
        kind,
        ...(named ? { named } : {}),
        ...(sideMission ? { sideMission } : {}),
        values: valuesFor(kind, s),
      });
    }
  }
  // Two distinct joker identities (FR1.2): events, never held.
  for (const id of ['JOKER-A', 'JOKER-B']) {
    cards.push({
      id,
      suit: 'JOKER',
      rank: 'J',
      s: 0,
      kind: 'event',
      values: { money: 0, rd: 0 },
      flavor: 'News Event — roll d6',
    });
  }
  return cards;
}

// --- missions (FR5.1 + kit p.4 chains) -----------------------------------

const BASE: PhaseName[] = ['Pre-launch', 'Launch', 'Reentry', 'Splashdown'];

function chain(...extra: PhaseName[]): PhaseName[] {
  return [...BASE.slice(0, 2), ...extra, ...BASE.slice(2)];
}

const MISSIONS: Mission[] = [
  { id: 'freedom-7', name: 'Freedom 7', year: 1961, program: 'mercury', requires: ['mercury', 'redstone'], chain: [...BASE], vp: 2 },
  { id: 'friendship-7', name: 'Friendship 7', year: 1962, program: 'mercury', requires: ['mercury', 'atlas'], chain: chain('Orbit'), vp: 3 },
  { id: 'faith-7', name: 'Faith 7', year: 1963, program: 'mercury', requires: ['mercury', 'atlas'], chain: chain('Orbit'), vp: 4 },
  { id: 'gemini-3', name: 'Gemini 3', year: 1965, program: 'gemini', requires: ['gemini', 'titan'], chain: chain('Orbit'), vp: 3 },
  { id: 'gemini-4', name: 'Gemini 4 (EVA)', year: 1965, program: 'gemini', requires: ['gemini', 'titan'], chain: chain('Orbit', 'EVA'), vp: 4 },
  { id: 'gemini-8', name: 'Gemini 8 (dock)', year: 1966, program: 'gemini', requires: ['gemini', 'titan', 'agena'], chain: chain('Orbit', 'Rendezvous'), vp: 5 },
  { id: 'gemini-12', name: 'Gemini 12', year: 1966, program: 'gemini', requires: ['gemini', 'titan'], chain: chain('Orbit', 'EVA'), vp: 5 },
  { id: 'apollo-7', name: 'Apollo 7', year: 1968, program: 'apollo', requires: ['csm', 'saturn-ib'], chain: chain('Orbit'), vp: 5 },
  { id: 'apollo-8', name: 'Apollo 8', year: 1968, program: 'apollo', requires: ['csm', 'saturn-v'], chain: chain('TLI/Coast', 'Lunar Orbit'), vp: 7 },
  { id: 'apollo-9', name: 'Apollo 9 (LM test)', year: 1969, program: 'apollo', requires: ['csm', 'lm', 'saturn-v'], chain: chain('Orbit', 'Rendezvous'), vp: 6 },
  { id: 'apollo-10', name: 'Apollo 10 (rehearsal)', year: 1969, program: 'apollo', requires: ['csm', 'lm', 'saturn-v'], chain: chain('TLI/Coast', 'Lunar Orbit', 'Descent'), vp: 7 },
  { id: 'apollo-11', name: 'Apollo 11 (Moon)', year: 1969, program: 'apollo', requires: ['csm', 'lm', 'saturn-v', 'eva-suit'], chain: chain('TLI/Coast', 'Lunar Orbit', 'Landing', 'Ascent'), vp: 10 },
];

// --- tech tree (FR4.2) -----------------------------------------------------

const TECH: TechItem[] = [
  { id: 'redstone', name: 'Redstone', program: 'mercury', rdCost: 2, moneyCost: 2, tags: ['propulsion', 'mercury'] },
  { id: 'atlas', name: 'Atlas', program: 'mercury', rdCost: 3, moneyCost: 3, tags: ['propulsion', 'mercury'] },
  { id: 'mercury', name: 'Mercury capsule', program: 'mercury', rdCost: 3, moneyCost: 2, tags: ['capsule', 'mercury'] },
  { id: 'titan', name: 'Titan', program: 'gemini', rdCost: 3, moneyCost: 3, tags: ['propulsion', 'gemini'], unlocksAfter: { program: 'mercury', minCompleted: 1 } },
  { id: 'gemini', name: 'Gemini capsule', program: 'gemini', rdCost: 4, moneyCost: 3, tags: ['capsule', 'gemini'], unlocksAfter: { program: 'mercury', minCompleted: 1 } },
  { id: 'agena', name: 'Agena target vehicle', program: 'gemini', rdCost: 2, moneyCost: 2, tags: ['agena', 'gemini'], unlocksAfter: { program: 'mercury', minCompleted: 1 } },
  { id: 'saturn-ib', name: 'Saturn IB', program: 'apollo', rdCost: 4, moneyCost: 4, tags: ['propulsion', 'apollo'], unlocksAfter: { program: 'gemini', minCompleted: 1 } },
  { id: 'saturn-v', name: 'Saturn V', program: 'apollo', rdCost: 7, moneyCost: 7, tags: ['propulsion', 'apollo'], unlocksAfter: { program: 'gemini', minCompleted: 1 } },
  { id: 'csm', name: 'Command/Service Module', program: 'apollo', rdCost: 5, moneyCost: 4, tags: ['capsule', 'csm', 'apollo'], unlocksAfter: { program: 'gemini', minCompleted: 1 } },
  { id: 'lm', name: 'Lunar Module', program: 'apollo', rdCost: 5, moneyCost: 5, tags: ['lm', 'apollo'], unlocksAfter: { program: 'gemini', minCompleted: 1 } },
  { id: 'eva-suit', name: 'EVA suit', program: 'apollo', rdCost: 2, moneyCost: 1, tags: ['suit', 'apollo'], unlocksAfter: { program: 'gemini', minCompleted: 1 } },
];

// --- events (FR9.2) --------------------------------------------------------

const EVENTS: EventEntry[] = [
  { face: 1, name: 'Gagarin Orbits!', effects: [{ type: 'sovietShift', amount: 3 }] },
  { face: 2, name: 'Soviet Lunar Probe', effects: [{ type: 'sovietShift', amount: 2 }] },
  { face: 3, name: 'Apollo 1 Fire', effects: [{ type: 'loseActions', amount: 2 }, { type: 'stunCrew', launches: 1 }] },
  { face: 4, name: "Kennedy's Moon Speech", effects: [{ type: 'rdGain', amount: 4 }] },
  { face: 5, name: 'Congressional Windfall', effects: [{ type: 'moneyGain', amount: 6 }] },
  { face: 6, name: 'Soyuz 1 Setback', effects: [{ type: 'sovietShift', amount: -3 }] },
];

// --- tuning (design-doc tuning list + kit p.2 formula table) ---------------

const TUNING: Tuning = {
  drawPerTurn: 2,
  actionsPerTurn: 3,
  handLimit: 7,
  turnsPerYear: 3,
  repairCostMinor: 3,
  repairCostMajor: 6,
  majorFailureMinShortfall: 4, // ruling 1: minor shortfall 1–3, major ≥4
  sovietTrackLength: 36,
  sovietDrift: 1,
  sovietPushFailure: 3,
  sovietPushSideMission: 1,
  milestoneEvery: 3,
  milestoneVpBite: 1,
  moneyBiteEvery: 6,
  milestoneMoneyBite: 3,
  sideMissionDifficulty: 4,
  sideMissionRetry: 1,
  sideMissionVp: 2,
  programDifficulty: { mercury: 3, gemini: 5, apollo: 7 } as Record<Program, number>,
  phaseOffsets: {
    'Pre-launch': 0,
    Launch: 0,
    Orbit: 0,
    Splashdown: 0,
    EVA: 1,
    Rendezvous: 1,
    'TLI/Coast': 1,
    'Lunar Orbit': 1,
    Reentry: 1,
    Landing: 2,
    Ascent: 2,
    Descent: 2, // ruling 10
  },
  retryPenalty: 2,
  finalMissionBonus: 1,
  crewSlots: { mercury: 1, gemini: 2, apollo: 3 },
  crewInjuryLaunches: 2,
  crewStunLaunches: 1,
  apollo1ActionLoss: 2,
  programBonuses: { mercury: 2, gemini: 3, apollo: 5 },
  tierThresholds: {
    moon: { distinguished: 70, administrator: 55 },
    timedOut: { honorable: 45, good: 30 },
  },
  startingMoney: 0,
  startingRd: 0,
};

/** The complete fixture bundle; memoized so tests share one content graph. */
export const TEST_CONTENT: Content = {
  cards: buildCards(),
  missions: MISSIONS,
  techTree: TECH,
  events: EVENTS,
  tuning: TUNING,
};

/** Fresh shallow copy for tests that mutate tuning. */
export function testContent(): Content {
  return { ...TEST_CONTENT, tuning: { ...TUNING } };
}

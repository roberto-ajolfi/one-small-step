/**
 * Printable-kit template — the layout layer of the kit generator (spec §5).
 *
 * Ports `proposals/one-small-step-printable-kit.html` (the visual golden
 * reference): the A4 page shell + stylesheet, the kit's editorial prose
 * (legends, boxlines, reminders) and the display captions the draft uses in
 * place of raw content names (hardware captions, milestone names…). Rules
 * numbers are never hardcoded here — the prose fragments take them as
 * arguments filled from `tuning.json` and the content rows by `generate.ts`.
 */

/** Escapes data text for HTML text nodes. Kit prose is emitted verbatim. */
export function esc(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ---------------------------------------------------------------------------
// Markup vocabulary (structural helpers used by generate.ts)
// ---------------------------------------------------------------------------

export function td(html: string, cls?: string): string {
  return `<td${cls ? ` class="${cls}"` : ''}>${html}</td>`;
}

export function th(html: string, cls?: string): string {
  return `<th${cls ? ` class="${cls}"` : ''}>${html}</th>`;
}

export function tr(cells: string): string {
  return `<tr>${cells}</tr>`;
}

export function table(...rows: string[]): string {
  return `<table>\n        ${rows.join('\n        ')}\n      </table>`;
}

export function h2(text: string): string {
  return `<h2>${text}</h2>`;
}

export function note(html: string): string {
  return `<div class="note">${html}</div>`;
}

export function boxline(html: string): string {
  return `<div class="boxline">${html}</div>`;
}

/** Pencil checkbox glyph (kit rows use ☐ cells for play tracking). */
export const CHECK = '\u2610';

/** "3rd"/"6th" for prose like "every 3rd turn" / "Every 6th space". */
export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

// ---------------------------------------------------------------------------
// Document shell
// ---------------------------------------------------------------------------

/** The kit stylesheet — a verbatim port of the golden draft's `<style>` block. */
export const KIT_CSS = `  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; background: #dcdcdc; margin: 0; padding: 8mm 0; color: #000; }
  .page { width: 210mm; min-height: 296mm; background: #fff; margin: 0 auto 8mm; padding: 11mm 12mm; box-shadow: 0 2mm 6mm rgba(0,0,0,.3); page-break-after: always; position: relative; }
  .footer { position: absolute; bottom: 6mm; left: 12mm; right: 12mm; font-size: 7pt; border-top: .5pt solid #000; padding-top: 1.5mm; display: flex; justify-content: space-between; }
  h1 { font-size: 15pt; letter-spacing: .12em; text-transform: uppercase; margin: 0 0 1mm; }
  .subtitle { font-size: 8pt; letter-spacing: .25em; text-transform: uppercase; margin-bottom: 3mm; }
  h2 { font-size: 9.5pt; letter-spacing: .08em; text-transform: uppercase; margin: 4mm 0 1.5mm; border-bottom: 1pt solid #000; padding-bottom: 1mm; }
  h3 { font-size: 8pt; letter-spacing: .06em; text-transform: uppercase; margin: 2mm 0 1mm; }
  table { width: 100%; border-collapse: collapse; font-size: 7.2pt; }
  th, td { border: .4pt solid #444; padding: .9mm 1.1mm; text-align: left; vertical-align: top; }
  th { background: #e9e9e9; font-size: 6.8pt; text-transform: uppercase; letter-spacing: .03em; }
  .num { text-align: center; width: 6.5mm; }
  .s { text-align: center; width: 5mm; font-size: 8.5pt; }
  .card { width: 9mm; font-weight: bold; white-space: nowrap; }
  .grid2 { display: flex; gap: 5mm; }
  .grid2 > div { flex: 1; }
  .legend { border: 1pt solid #000; padding: 2mm 2.5mm; font-size: 7.2pt; margin-bottom: 3mm; }
  .legend b { text-transform: uppercase; letter-spacing: .04em; }
  .note { font-size: 6.8pt; font-style: italic; margin-top: 1mm; }
  .track { display: flex; flex-wrap: wrap; gap: 0; margin: 2mm 0 1mm; }
  .space { width: 10.35mm; height: 9mm; border: .5pt solid #000; margin: 0 -0.25pt -0.5pt 0; font-size: 6.5pt; text-align: center; padding-top: .5mm; position: relative; }
  .space.ms { border: 1.2pt solid #000; font-weight: bold; }
  .space.final { background: #000; color: #fff; font-weight: bold; }
  .mslabels { display: flex; flex-wrap: wrap; font-size: 5.8pt; }
  .mslabel { width: 31.05mm; text-align: center; border-top: .5pt solid #000; padding-top: .6mm; margin-top: -.5pt; }
  .check { display: inline-block; width: 3.2mm; height: 3.2mm; border: .6pt solid #000; margin-right: 1mm; vertical-align: -.4mm; }
  .boxline { border: .5pt solid #000; padding: 1.5mm 2mm; font-size: 7.2pt; margin: 1.5mm 0; }
  .tier { border-collapse: collapse; }
  .tier td, .tier th { font-size: 7pt; }
  .turngrid td { text-align: center; font-size: 6.8pt; }
  .turngrid .cb { font-size: 8pt; }
  .gap { height: 2mm; }`;

/** One A4 kit page: heading, subtitle, body, and the fixed footer rule. */
export function page(args: {
  heading: string;
  subtitle: string;
  body: string;
  pageNo: number;
  pageLabel: string;
}): string {
  return `<div class="page">
  <h1>${args.heading}</h1>
  <div class="subtitle">${args.subtitle}</div>
  ${args.body}
  <div class="footer"><span>One Small Step \u2014 Printable Kit</span><span>Page ${args.pageNo}/4 \u2014 ${args.pageLabel}</span></div>
</div>`;
}

/** The standalone document around the four pages (open in a browser, print to PDF). */
export function kitDocument(pages: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>One Small Step \u2014 Printable Kit</title>
<style>
${KIT_CSS}</style>
</head>
<body>

${pages}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Kit display captions (presentation only — rules and data live in src/data)
// ---------------------------------------------------------------------------

/** Suit glyphs as printed on the kit (filled marks, unlike the web theme). */
export const SUIT_SYMBOL: Record<string, string> = {
  H: '\u2665', // ♥
  D: '\u2666', // ♦
  S: '\u2660', // ♠
  C: '\u2663', // ♣
};

/** Page-1 section headings per suit. */
export const SUIT_HEADING: Record<string, string> = {
  H: '\u2665 Hearts \u2014 Person (crew)',
  D: '\u2666 Diamonds \u2014 Bonus',
  S: '\u2660 Spades \u2014 Equipment',
  C: '\u2663 Clubs \u2014 Extra Action',
  JOKER: 'Jokers \u2014 News Events',
};

/** The two joker identities are printed as filled/open marks. */
export const JOKER_MARKS: Record<string, string> = {
  'JOKER-A': '\u25cf', // ●
  'JOKER-B': '\u25cb', // ○
};

/** "final MR" marks on the ladder: program → the kit's initials. */
export const PROGRAM_INITIALS: Record<string, string> = {
  mercury: 'MR',
  gemini: 'G',
  apollo: 'A',
};

/** The ladder's chain column abbreviates the always-flown bookend phases. */
export const CHAIN_ABBREV: Record<string, string> = {
  'Pre-launch': 'Pre',
  Splashdown: 'Splash',
};

/**
 * Hardware captions on kit p.2 ("Redstone **booster**") and the short names
 * the ladder's Requires column uses ("CSM"). The golden draft's display
 * wording — content names come from `tech-tree.json` and stay authoritative.
 */
export const TECH_CAPTIONS: Record<string, { lead: string; suffix: string; short: string }> = {
  redstone: { lead: 'Redstone', suffix: 'booster', short: 'Redstone' },
  atlas: { lead: 'Atlas', suffix: 'booster', short: 'Atlas' },
  mercury: { lead: 'Mercury', suffix: 'capsule', short: 'Mercury' },
  titan: { lead: 'Titan', suffix: 'booster', short: 'Titan' },
  gemini: { lead: 'Gemini', suffix: 'capsule', short: 'Gemini' },
  agena: { lead: 'Agena', suffix: 'target vehicle', short: 'Agena' },
  'saturn-ib': { lead: 'Saturn IB', suffix: '', short: 'Saturn IB' },
  'saturn-v': { lead: 'Saturn V', suffix: '', short: 'Saturn V' },
  csm: { lead: 'Command/Service Module', suffix: '(CSM)', short: 'CSM' },
  lm: { lead: 'Lunar Module', suffix: '(LM)', short: 'LM' },
  'eva-suit': { lead: 'EVA suit', suffix: '', short: 'EVA suit' },
};

/** Kit labels for dev-discount domains ("Dev −2 R&D on rockets"). */
export const DOMAIN_LABELS: Record<string, string> = {
  propulsion: 'rockets',
  capsule: 'capsules',
  lm: 'LM',
  agena: 'Agena',
  csm: 'CSM',
  mercury: 'Mercury',
  gemini: 'Gemini',
};

/**
 * Crew-pool glosses for the two tech assignments the draft phrases by hand
 * (Faget's capsule ids roll up to "capsules"; Hamilton's per-turn discount
 * reads "software"). Everyone else derives from the ability data.
 */
export const CREW_DEV_LABELS: Record<string, string> = {
  '9C': 'capsules',
  QS: 'software',
};

/** The crew pool's tech roster order in the kit draft (card-table order otherwise). */
export const CREW_TECH_ORDER = ['KS', '9C', '10C', 'JS', 'JC', 'QC', 'KC', 'QS'];

/** The 36-space track's milestone captions (kit p.2; the web track has its own set). */
export const MILESTONE_NAMES: Record<number, string> = {
  3: 'Gagarin',
  6: 'Titov',
  9: 'Tereshkova',
  12: 'Leonov (spacewalk)',
  15: 'Voskhod',
  18: 'Luna 9',
  21: 'Zond flyby',
  24: 'Soyuz docking',
  27: 'Luna 16',
  30: 'Lunokhod',
  33: 'Soviet lunar orbit',
  36: 'MOON \u2014 THEY WIN',
};

/** Short event names for the track heading ("…, Soyuz 1 −2"). */
export const EVENT_SHORT_NAMES: Record<number, string> = { 6: 'Soyuz 1' };

/**
 * The tech table's Notes column expands one mission name relative to the
 * ladder ("Gemini 8 (docking)"); elsewhere the data name is used as printed.
 */
export const MISSION_NOTE_SUFFIX: Record<string, string> = { 'gemini-8': '(docking)' };

/**
 * The scorepad (p.3) shortens two ladder names, dropping their glosses; the
 * campaign ladder (p.4) prints the full data name.
 */
export const SCOREPAD_NAMES: Record<string, string> = {
  'apollo-9': 'Apollo 9',
  'apollo-10': 'Apollo 10',
};

/** Track spaces per printed row; each milestone caption spans one row segment. */
export const TRACK_SPACES_PER_ROW = 18;

/** Blank rows in the kit's optional game log (p.3). */
export const LOG_ROWS = 12;

/** The turn tracker covers 1960–1969 (mirrors the engine's 30-turn timeline). */
export const START_YEAR = 1960;
export const YEAR_COUNT = 10;

// ---------------------------------------------------------------------------
// Prose blocks (kit copy — numbers arrive as arguments from the content)
// ---------------------------------------------------------------------------

/** Page-1 legend: how to use a card (verbatim kit copy). */
export function cardLegend(): string {
  return `<div class="legend">
    <b>How to use a card</b> \u2014 pick ONE mode when playing:<br>
    &nbsp;&nbsp;\u25b8 <b>Cash for Money</b> = <i>s</i> &nbsp;&nbsp;\u25b8 <b>Invest for R&#38;D</b> = \u2308<i>s</i>/2\u2309 &nbsp;&nbsp;\u25b8 <b>Play identity mode</b> (below).<br>
    <b>Strength <i>s</i></b>: ranks 2\u201310 = pip \u00b7 J/Q/K = 10 \u00b7 A = 12.<br>
    <b>Suits 2\u201310</b>: \u2665 Person (crew +\u2308<i>s</i>/3\u2309, burnable as repair) \u00b7 \u2660 Equipment (repair <i>s</i>, pre-bid +<i>s</i>) \u00b7 \u2666 Bonus (hold: +\u2308<i>s</i>/2\u2309 to a draw or \u2212repair) \u00b7 \u2663 Extra action (+1 action).<br>
    <b>Named band</b>: 9\u2013K \u2665 + J\u2013K \u2666 = astronauts \u00b7 9\u2013K \u2663 + J\u2013K \u2660 = techs (Person + ability; techs flex: development discount OR mission support).<br>
    <b>Aces</b> = Side Missions \u00b7 <b>Jokers</b> = News Events (roll d6 on the Event Table, page 2).
  </div>`;
}

/** Note under the joker table (p.1). */
export function namedBandNote(): string {
  return note('Named band row assignment is data-tunable; abilities are tuning knobs (shapes fixed).');
}

/** Note under the tech tree (p.2). */
export function techUnlockNote(): string {
  return note(
    'Programs unlock by milestone: complete Mercury missions to unlock Gemini purchases; ' +
      'complete Gemini to unlock Apollo. Purchases cost 1 action each.',
  );
}

/** Milestone-bite rule box under the track (p.2). */
export function biteBox(a: {
  vpBite: number;
  moneyEvery: number;
  moneySpaces: string;
  moneyBite: number;
  moonName: string;
  trackLength: number;
}): string {
  return boxline(
    `<b>Milestone bite</b> (\u25cf spaces): \u2212${a.vpBite} VP each. ` +
      `<b>Every ${ordinal(a.moneyEvery)} space</b> (${a.moneySpaces}): also \u2212${a.moneyBite} Money. ` +
      `<b>Tie-break: the player wins ties</b> \u2014 if ${esc(a.moonName)} splashdown happens in the ` +
      `same turn the Soviets cross space ${a.trackLength}, the player wins. ` +
      'Side-mission perks may shave drift.',
  );
}

/** Phase-difficulty formula box (p.2). */
export function difficultyBox(a: {
  programBase: string;
  phaseOffsets: string;
  finalBonus: number;
  retryPenalty: number;
  repairMinor: number;
  repairMajor: number;
}): string {
  return boxline(
    `<b>difficulty = program base + phase offset</b> &nbsp;(+${a.finalBonus} if it's the ` +
      `program's final mission; +${a.retryPenalty} on every phase of a retried mission).<br>
    <b>Program base</b>: ${a.programBase}. &nbsp;<b>Phase offsets</b>: ${a.phaseOffsets}.<br>
    <b>Outcome</b>: rank + crew + pre-bid \u2265 difficulty = <b>Success</b>; below = ` +
      `<b>Minor Failure</b> (pay ${a.repairMinor} repair); far below = <b>Major Failure</b> ` +
      `(pay ${a.repairMajor} repair). Can't pay = mission fails.`,
  );
}

/** Game-end reminders box (p.3). */
export function endRemindersBox(a: {
  phases: number;
  moonName: string;
  totalTurns: number;
  trackLength: number;
}): string {
  return boxline(
    `<b>Game end reminders.</b> \u25b8 Moon: complete all ${a.phases} phases of ${esc(a.moonName)} ` +
      '(including splashdown) \u2014 race ends immediately. ' +
      `\u25b8 Turn ${a.totalTurns} ends the timeline: score stands as your historical grade. ` +
      `\u25b8 Soviets crossing space ${a.trackLength} first = total loss. ` +
      '\u25b8 <b>Ties go to the player.</b>',
  );
}

/** Turn-sequence box (p.4). */
export function turnSequenceBox(a: {
  draws: number;
  actions: number;
  drift: number;
  turnsPerYear: number;
  handLimit: number;
}): string {
  return boxline(
    `<b>1. Draw</b> ${a.draws} cards \u2192 <b>2. Actions</b> (${a.actions}: play a card \u00b7 buy ` +
      'hardware \u00b7 launch the mission \u00b7 fly a Side Mission; Extra action cards add +1) ' +
      `\u2192 <b>3. Mission</b> (at most 1 per turn, resolved instantly) \u2192 <b>4. Upkeep</b> ` +
      `(Soviet +${a.drift}, advance turn).<br>
    <b>Year end</b> (every ${ordinal(a.turnsPerYear)} turn): discard to hand ${a.handLimit}, then ` +
      `refill to ${a.handLimit}. Crew pool heals. Events trigger whenever drawn \u2014 including mid-mission.`,
  );
}

/** Hand/crew/repair reminders note (p.4). */
export function crewReminderNote(a: {
  handLimit: number;
  crewSlots: string;
  repairMinor: number;
  repairMajor: number;
}): string {
  return note(
    `Reminders: hand limit ${a.handLimit} (reset at year end) \u00b7 crew slots: ${a.crewSlots} ` +
      `\u00b7 repair costs: minor ${a.repairMinor}, major ${a.repairMajor} ` +
      '\u00b7 Person/Equipment cards burn for repair = their s.',
  );
}

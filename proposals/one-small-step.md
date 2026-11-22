# One Small Step

## Summary

*One Small Step* is a solitaire card game simulating the 1960–1969 space race between the USA and the USSR. The player runs the US space agency, managing a hand of multi-use cards drawn from two standard 54-card decks to fund and research hardware (Mercury → Gemini → Apollo) and fly a fixed ladder of historical missions, each resolved through a chain of mission phases. Cards serve double duty: their *resource side* builds the program (Money, R&D, crew, equipment, side missions, events) and their *rank* resolves mission phases against difficulty targets. Meanwhile a Soviet progress track drifts forward every turn, accelerated by events and mission failures; if the Soviets reach the Moon first the game is lost outright. The game ends in victory by landing on the Moon and returning safely, or after the 30th turn, when accumulated mission points are scored as a historical grade.

The deliverable is (a) this game design, whose physical prototype uses two standard card decks plus a mapping table, and (b) a playable digital prototype (TypeScript rules engine + React/Vite UI) used to test and tune the design, including a balance harness with auto-played win-rate statistics.

## Goals

- Deliver a complete, replayable solitaire ruleset playable on a table with two standard 54-card decks and a printed mapping table.
- Preserve the tension of the history: limited money vs. limited R&D, program milestones, mission risk, and relentless Soviet pressure.
- Make every card a meaningful multi-use decision (cash it, research it, or play its identity).
- Produce a digital prototype that is the single source of truth for rules, faithful to the table experience, and instrumented for balance tuning (seeds, auto-play, win-rate stats, tunable constants).
- Keep the rules teachable: a fixed turn structure, one draw-timing rule for everything, and a card skeleton (suit = identity mode, rank = strength) that is memorable even without the table.

## Actors / Users

- **Player (1)** — the NASA administrator. Plays alone: manages hand and resources, develops hardware, assigns crews, launches missions, and races the Soviet track. No opponent AI is played; the game system (deck + track) is the antagonist.
- **Designer / playtester** — uses the digital prototype's balance harness (auto-play simulations, tunable constants, seeded deals) to iterate on numbers without editing code.
- **Physical player** — uses the printed 54-row mapping table to translate standard cards into game entities.

## Functional Requirements

### FR1 — Components and card mapping
- FR1.1 The game uses **two standard 54-card decks = 108 cards** (2 identical copies of each physical card). The mapping table has **54 rows**.
- FR1.2 Mapping is **hybrid**: derivable skeleton + named identities. *(OQ1 resolved.)*
  - **Suit → identity mode** (for rows 2–10): **Hearts = Person** (generic crew), **Spades = Equipment** (repair points), **Diamonds = Bonus** (held +X modifier), **Clubs = Extra action** (+1 play). Suit flavor remains thematic (Diamonds feel like funding, Clubs like management).
  - **Rank = strength/value (s)**: `s = pip for 2–10; s = 10 for J/Q/K; s = 12 for A`. All rank-scaling derives from s (see FR1.3).
  - **Named people band (extended rule)**: rows **9–K of Hearts + J–K of Diamonds = 8 named astronauts**; rows **9–K of Clubs + J–K of Spades = 8 named techs**. Named people keep the Person identity mode and add a small special ability. (Rows 2–8 of each suit stay generic.)
  - **Aces = Side Missions** (4 rows, one per suit — see FR7).
  - **Jokers = News Events**: rolled on a printed **6-entry event table (d6)** — see FR9. (Only 2 distinct joker identities × 2 copies = 4 event triggers per pool.)
- FR1.3 Every card carries **2 universal modes + 1 identity mode**; the player picks **one** mode when playing a card:
  - **Money**: cash the card; value = **s**.
  - **R&D**: invest the card; value = **⌈s/2⌉**.
  - **Identity mode** (suit/face/ace-driven):
    - Person (named or generic): crew bonus **+⌈s/3⌉** to the assigned mission's phase draws (named people add an ability); can be burned as repair fuel.
    - Equipment: **repair points = s** in missions; can be pre-bid for +s to a phase check.
    - Bonus: held and discarded for **+⌈s/2⌉** to any phase draw, or to reduce a repair cost by the same.
    - Extra action: **+1 action** in the current turn's Action phase.
    - Side Mission (aces): fly as a single draw vs difficulty 4 mini-mission (FR7).
    - Event (jokers): trigger the event table immediately on draw (FR9).
- FR1.4 The full 54-row table is stored as **data (JSON/CSV)** in the digital prototype and renderable as a **4-page printable kit**: (1) mapping table, (2) game board — tech tree checklist, 36-space Soviet track, event table, phase-difficulty reference, (3) scorepad, (4) mission-status sheet (campaign ladder with checkboxes). *(OQ8 resolved.)* The design document carries the derivation rules plus sample rows (below).

**Mapping table — sample rows (illustrative; full table is data):**

| Card | Identity | s | Money | R&D | Identity mode |
|------|----------|---|-------|-----|---------------|
| K♥ | Neil Armstrong (named astronaut) | 10 | 10 | 5 | Crew +4; ability: +2 to Landing/Ascent |
| 10♥ | John Glenn (named astronaut) | 10 | 10 | 5 | Crew +4; ability: +2 to Orbit |
| 5♥ | Generic crew | 5 | 5 | 3 | Crew +2 |
| 7♠ | Generic equipment | 7 | 7 | 4 | Repair 7 / pre-bid +7 |
| Q♠ | Margaret Hamilton (named tech) | 10 | 10 | 5 | Dev: −2 R&D on one purchase/turn; +2 to Landing & Reentry |
| 4♣ | Management | 4 | 4 | 2 | +1 action this turn |
| 8♦ | Generic bonus | 8 | 8 | 4 | Held: +4 to a draw or −4 repair cost |
| A♦ | Side Mission: Telstar | 12 | 12 | 6 | Fly 2-phase check; VP +2 & +2 Money/year |
| Joker | News Event | — | — | — | Roll d6 on the event table |

### FR2 — Turn structure
- FR2.1 The game lasts **10 years (1960–1969), 3 turns per year = 30 turns**. Target session: 60–90 minutes.
- FR2.2 Each turn runs fixed phases:
  1. **Draw**: draw **2 cards** from the shared fate deck.
  2. **Action phase**: **3 actions**. Actions are: play a card (any mode), purchase/develop a tech-tree item, launch the turn's mission, or fly a Side Mission. **Extra action** cards grant +1 action.
  3. **Mission phase**: at most **one mission per turn**, resolved instantly through its full phase chain.
  4. **Upkeep**: Soviet track advances its base drift (+ event/failure pushes applied when they occur), then turn/year marker advances.
- FR2.3 **Year end**: discard down to a **hand limit of 7**, then refill to 7 ("appropriation cycle"). The fate deck reshuffles its discard pile when exhausted.

### FR3 — Shared fate deck
- FR3.1 One shuffled 108-card pool serves **both** hand draws and mission-phase outcome draws. Cards drawn for phases are read for their rank (outcome) and then discarded as normal.
- FR3.2 **Events trigger immediately on draw** (whether drawn for hand refill or mid-mission as a phase draw): roll the event table, resolve, then the joker goes to the discard pile.

### FR4 — Resources and development
- FR4.1 Two resources: **Money** and **R&D Points**. Both are produced by playing cards in their universal modes.
- FR4.2 Hardware lives on a **tech tree / checklist** with **dual costs: an R&D cost (design) and a Money cost (production)**. Developed hardware is permanent. Cost list (tuning constants; calibrated by the M3 balance harness — see Open Questions): Redstone 5R/5M, Atlas 8R/8M, Mercury capsule 8R/5M, Titan 8R/8M, Gemini capsule 10R/8M, Agena target 5R/5M, Saturn IB 10R/10M, Saturn V 18R/18M, CSM 12R/10M, Lunar Module 12R/12M, EVA suit 5R/2M.
- FR4.3 Programs unlock by **milestones, not calendar**: completing Mercury objectives unlocks Gemini hardware, completing Gemini unlocks Apollo hardware. A poor early game delays the program but cannot brick it.
- FR4.4 Missions have **explicit hardware prerequisites** (see FR5.1). Missing hardware means the mission cannot launch.

### FR5 — Missions and phases
- FR5.1 **Fixed historical campaign ladder** (OQ3 resolved) — 12 named missions in order, failed missions retryable at **+2 to all phase difficulties**:

| # | Mission | Year | Chain | Requires | VP |
|---|---------|------|-------|----------|----|
| 1 | Freedom 7 (suborbital) | 1961 | 4 phases | Mercury + Redstone | 2 |
| 2 | Friendship 7 (orbital) | 1962 | 5 | Mercury + Atlas | 3 |
| 3 | Faith 7 (endurance) | 1963 | 5 | Mercury + Atlas | 4 |
| 4 | Gemini 3 | 1965 | 5 | Gemini + Titan | 3 |
| 5 | Gemini 4 (EVA) | 1965 | 6 (+EVA) | Gemini + Titan | 4 |
| 6 | Gemini 8 (dock) | 1966 | 6 (+Rendezvous) | Gemini + Titan + Agena | 5 |
| 7 | Gemini 12 (EVA endurance) | 1966 | 6 | Gemini + Titan | 5 |
| 8 | Apollo 7 (Earth orbit) | 1968 | 5 | CSM + Saturn IB | 5 |
| 9 | Apollo 8 (lunar orbit) | 1968 | 6 | CSM + Saturn V | 7 |
| 10 | Apollo 9 (LM test) | 1969 | 6 | CSM + LM + Saturn V | 6 |
| 11 | Apollo 10 (dress rehearsal) | 1969 | 7 | CSM + LM + Saturn V | 7 |
| 12 | **Apollo 11 (Moon landing)** | 1969 | 8 | CSM + LM + Saturn V + EVA suit | 10 |

- FR5.2 **Phase chains scale with ambition**: suborbital = Pre-launch, Launch, Reentry, Splashdown (4); orbital adds Orbit (5); EVA/Rendezvous variants insert those phases (6); lunar orbit = …TLI/Coast, Lunar Orbit… (6); lunar landing = Pre-launch, Launch, TLI/Coast, Lunar Orbit, Landing, Ascent, Reentry, Splashdown (8).
- FR5.3 **Difficulty formula (OQ3 resolved)**: `phase difficulty = program base (Mercury 3 / Gemini 5 / Apollo 7) + phase offset (0 early, +1 late, +2 Landing/Ascent, 0 Splashdown) + 1 for the program's final mission`. Retry = +2 to all phases.
- FR5.4 **Resolution** of one phase: the player may **pre-bid** equipment/other cards from hand (adding their points to the check), then draws one card from the shared fate deck. Outcome = rank + crew bonus + pre-bid vs phase difficulty:
  - **Success** (meets or beats difficulty),
  - **Minor Failure** (below by a margin),
  - **Major Failure** (far below).
- FR5.5 **Post-repair**: a Minor Failure costs **3 repair points**, a Major Failure **6**. Repair points come from discarding Equipment/Person cards from hand (value = s) or exhausting equipment in play. If the player cannot pay, the mission fails.
- FR5.6 **Mission failure consequences**: the launch is lost (turn's mission opportunity spent), the Soviet track takes a **+3 push**, the mission becomes retryable at +2 difficulty, and assigned crew are **injured** (unavailable for the next 2 mission launches — see FR6.5). Crew never die.

### FR6 — Crew
- FR6.1 **Permanent crew pool** *(OQ7 resolved)*: playing a Person card recruits them into the crew pool (kept face-up at the table), available every turn. Missions have **crew slots** (e.g. 1 for Mercury, 2 for Gemini, 3 for Apollo). Assigned People add **+⌈s/3⌉** to every phase draw of the mission (named people add an ability on top).
- FR6.2 **Named astronauts (8)**: Shepard, Glenn, Grissom, White, Borman, Armstrong, Aldrin, Collins. **Named techs (8)**: von Braun, Gilruth, Debus, Kraft, Kranz, Houbolt, Margaret Hamilton, Max Faget. *(OQ2 resolved; named band = 9–K of ♥ + J–K of ♦ for astronauts, 9–K of ♣ + J–K of ♠ for techs.)*
- FR6.3 **Techs (black-face named people) flex**: each turn a tech is assigned either to **development** (−2 R&D on one purchase in their domain) or as **mission support** (their phase bonus; no crew slot needed).
- FR6.4 People cards can be **burned as repair fuel** in a crisis (FR5.5), which removes them from the pool permanently.
- FR6.5 **Injury/stun timing** *(OQ7 resolved)*: injured crew can't be assigned for the **next 2 mission launches** (and heal at year end at the latest). The **Apollo 1 Fire** event stuns every ready crew member for **1 mission launch**.
- FR6.6 **Named abilities** (shapes are fixed; numeric values are tuning knobs — OQ12 resolved):

| Person | Ability |
|---|---|
| Shepard | +2 to Launch |
| Glenn | +2 to Orbit |
| Grissom | +1 to every phase (versatile commander) |
| Ed White | +2 to EVA |
| Borman | +2 to TLI/Coast |
| Armstrong | +2 to Landing & Ascent |
| Aldrin | +2 to Rendezvous & EVA |
| Collins | +2 to Lunar Orbit & Reentry |
| von Braun | Dev: −2 R&D on propulsion purchases; +1 to Launch |
| Gilruth | Dev: −2 R&D on capsule purchases; +1 to Splashdown |
| Debus | +2 to Pre-launch; Dev: −1 R&D on any purchase |
| Kraft | Once per mission: +2 to any one phase (flight director's call) |
| Kranz | Once per mission: reroll one failed phase draw |
| Houbolt | Dev: −2 R&D on LM/Agena; +1 to Lunar Orbit |
| Hamilton | Dev: −2 R&D on one purchase/turn; +2 to Landing & Reentry |
| Faget | Dev: −2 R&D on CSM/Mercury/Gemini; +1 to Reentry |

### FR7 — Side Missions
- FR7.1 Side Missions are the **four aces** (×2 copies). Flying one = **1 action + a single draw vs difficulty 4** (crew/bonus/pre-bid apply). Success: **VP +2 + a permanent perk**. Failure: **Soviet track +1**, and the Side Mission may be retried later at +1 difficulty. *(OQ6 resolved.)*
- FR7.2 The four Side Missions: **A♥ The New Nine** (+1 to all crew bonuses), **A♦ Telstar Communications Satellite** (+2 Money at each year-end), **A♠ Deep Space Network** (+1 to every phase draw), **A♣ Unmanned Test Program (Ham & Enos)** (−1 difficulty to the first attempted mission of each program).
- FR7.3 **Anti-stacking**: each named perk can be earned **only once** (flying the second copy of the same ace grants VP only, no double perk); perk wordings are additive ("add +1"), never multiplicative.

### FR8 — Soviet progress
- FR8.1 The Soviet track is **36 spaces** *(OQ10 resolved)*: pure drift **+1/turn** in Upkeep (unopposed Soviets finish at turn 36) plus **pushes**: events +6/+4 (event table), mission failures +3, Soyuz-1 relief −2. Expected movement ≈ 37 over a full 30 turns (drift 30 + ≈7 of event pushes) — a real race against a typical Apollo 11 at turn ~28. Constants are fine-tuned by the harness against the 30–40% win-rate target *(M3: calibrated — see Open Questions)*.
- FR8.2 **Milestone bite every 3rd space (12 milestones)**: **−1 VP** (prestige theft); every 6th space also **−3 Money** (budget pressure). Milestone names (in order): Gagarin, Titov, Tereshkova, Leonov spacewalk, Voskhod multi-crew, Luna 9 soft landing, Zond lunar flyby, Soyuz docking, Luna 16 sample return, Lunokhod rover, Soviet lunar orbit — then the final (36th) space = **Soviet Moon landing = total loss**.
- FR8.3 **Tie-break: the player wins ties** — if Apollo 11 splashdown occurs in the same turn the Soviets cross the final space, the player wins. A successful player Moon landing ends the race permanently.

### FR9 — Events
- FR9.1 Jokers are **News Events**: on draw, roll a **d6** on the printed event table, resolve immediately (FR3.2), discard the joker. *(OQ2 resolved.)*
- FR9.2 Event table (4 joker cards × 2 copies trigger rolls):

| d6 | Event | Effect |
|----|-------|--------|
| 1 | Gagarin Orbits! | Soviet track +6 |
| 2 | Soviet Lunar Probe | Soviet track +4 |
| 3 | Apollo 1 Fire | Lose 2 actions next turn; all crew stunned 1 turn |
| 4 | Kennedy's Moon Speech | +4 R&D |
| 5 | Congressional Windfall | +6 Money |
| 6 | Soyuz 1 Setback | Soviet track −2 |

### FR10 — Scoring and endings
- FR10.1 **Score** = mission VP (61 max from the ladder) + program completion bonuses (Mercury +2 / Gemini +3 / Apollo +5) + side missions (+2 each) − Soviet milestone bites − failure penalties (−1 per failed attempt).
- FR10.2 **Victory (Moon landing + splashdown)** tiers by final score: ≥75 **Distinguished Service Medal**, 65–74 **NASA Administrator**, <65 **Mission Accomplished**. **Timed out** (turn 30, no landing): ≥55 **Honorable Mention**, 45–54 **Good Effort**, <45 **Budget Overrun**. *(Cut-offs calibrated against simulated score distributions — Open Questions.)*
- FR10.3 **Total loss**: Soviets reach the final track space before the player's Moon landing. No score is honored.

### FR11 — Digital prototype
- FR11.1 Complete playable game: all 30 turns, full campaign, full card table, events, tech tree, Soviet track, scoring.
- FR11.2 **Full table simulation UI**: hand fan, draw/discard piles, tech-tree checklist panel, Soviet track + timeline strips, mission panel with live phase chain, resource counters, action log. Click-to-play with optional drag & drop.
- FR11.3 **Balance harness**: seeded RNG (shareable seed strings), auto-play simulations, win-rate statistics, and tunable constants (draw counts, difficulties, repair costs, drift rates) adjustable without code edits.
- FR11.4 Quality-of-life: **undo**, **save/load**, in-game **rules reference**, thematic **60s NASA-poster visual style**.

## Non-Functional Requirements

- **NFR1 — Single source of truth**: the rules engine encodes the physical ruleset 1:1; nothing in the UI may bypass it. The same engine powers auto-play balance simulations.
- **NFR2 — Determinism**: all randomness flows through a seeded PRNG so any game state is reproducible from a seed (bug reports, design discussions, harness runs).
- **NFR3 — Data-driven content**: card table, missions, tech tree, events, and tuning constants are JSON/TS data modules, editable without touching engine code, and exportable to a printable mapping sheet.
- **NFR4 — Session ergonomics**: a 30-turn game must support undo and save/load; no information may be hidden from the player (perfect information about the deck's composition, standard for the genre).
- **NFR5 — Performance**: trivial for a card game — instant response to card plays; auto-play harness should simulate ≥1000 games in seconds.
- **NFR6 — Portability of the physical design**: every mechanic must be executable with two standard decks + printed table + a few tokens/counters (and one d6 for events) — no custom card faces required.
- **NFR7 — Accessibility**: readable card text, colorblind-safe suit/categorical coding, keyboard operability of the UI.

## Architecture & Technologies

- **Language / runtime**: TypeScript throughout.
- **Rules engine** (`engine/`): framework-free pure functions over an immutable-ish `GameState`; all transitions (draw, play, resolve phase, repair, upkeep, Soviet advance) are engine actions; reducer-style with a move-log for undo/replay.
- **Simulation harness** (`sim/`): auto-player policy + Monte Carlo runner over the engine; reports win rate, average score, per-mission failure rates, turn-by-turn resource curves; constants injected from `tuning.json`.
- **UI** (`web/`): React + Vite single-page app rendering the table simulation; local state synced to the engine; save/load via `localStorage` (or file export); seed input in the header; rules overlay.
- **Content** (`data/`): `cards.json` (54-row mapping table), `missions.json`, `tech-tree.json`, `events.json`, `tuning.json`. A small script renders `cards.json` to a printable sheet (HTML/PDF).
- **Testing**: engine unit tests (phase resolution math, repair economy, milestone triggers) + harness smoke tests on win-rate bands.

## Data Model / Entities

- **Card** (54 rows ×2 copies): `id` (e.g. `7H`), `suit`, `rank`, `s` value (pip 2–10; faces 10; ace 12), `identityKind` (Person named / Person generic / Equipment / Bonus / ExtraAction / SideMission / Event), `identity` (name & ability for named rows; side-mission name for aces), `universalModes` (Money = s, R&D = ⌈s/2⌉), `identityMode` values (crew +⌈s/3⌉, repair s, bonus +⌈s/2⌉), `flavor`.
- **GameState**: `turn`, `year` (1960–69), `phase` (Draw/Actions/Mission/Upkeep), `hand[]`, `deck[]`, `discard[]`, `resources` {money, rd}, `techTree` (items with `developed` flag), `crewPool` (recruited people; status: ready / injured(2 launches) / stunned(1 launch)), `sovietTrack` (position 0–36, milestone list), `campaign` (current mission index, per-mission status: pending/active/failedCount/completed), `sideMissions` (flown status & perks earned), `vp`, `log[]`, `seed`.
- **Mission**: `id`, `name`, `year`, `program`, `requiredHardware[]`, `phases[]`, `vp`, `retryPenalty` (+2 difficulty), `flavor`.
- **MissionPhase**: `name` (Pre-launch, Launch, Orbit, EVA, Rendezvous, TLI/Coast, Lunar Orbit, Landing, Ascent, Reentry, Splashdown…), `difficulty` = program base + offset (+1 final mission).
- **PhaseResolution**: `drawnCard`, `preBid[]`, `crewBonus`, `total`, `margin`, `outcome` (Success/MinorFailure/MajorFailure), `repairPaid[]`.
- **TechItem**: `id`, `name`, `program`, `rdCost`, `moneyCost`, `prerequisites[]`, `grants` (mission eligibility, phase bonuses).
- **SovietTrack**: `position` (0–36 spaces), `milestones[]` (12 named, every 3rd space, bite: −1 VP; every 6th also −3 Money), `finalSpace` (36th) = Soviet Moon landing = total loss (player wins ties).
- **EventTable** (d6): 6 entries as in FR9.2; physical play rolls one d6 *(OQ9 resolved)*.
- **SideMission** (ace): `name`, `difficulty` (4), `retryPenalty` (+1), `vp` (+2), `perk` (permanent, unique — earnable once).
- **Roster**: 8 named astronauts, 8 named techs (FR6.2), each with an ability per the FR6.6 table.
- **Tuning constants**: drawPerTurn (2), actionsPerTurn (3), handLimit (7), turnsPerYear (3), repairCostMinor (3), repairCostMajor (6), sovietTrackLength (36), sovietDrift (+1/turn), sovietPushEvent (+6/+4), sovietPushFailure (+3), sovietRelief (−2), sideMissionDifficulty (4), sideMissionRetry (+1), difficulty bases (Mercury 3 / Gemini 5 / Apollo 7), retryPenalty (+2), rank→value formulas, tech-cost list (FR4.2), starting resources (0/0).

## APIs / Interfaces

- **Engine API** (pure, synchronous):
  - `newGame(seed, tuning): GameState`
  - `apply(state, move): GameState` where `move` ∈ { `draw`, `playCard{cardId, mode, target}`, `developTech{techId}`, `launchMission{missionId, crew[], preBid[]}`, `resolvePhase` (engine-driven draw), `payRepair{cards[]}`, `flySideMission{cardId, crew[], preBid[]}`, `endTurn`, `undo` }
  - `legalMoves(state): Move[]` — powers UI hints and the auto-player.
  - `scoreGame(state): {vp, tier, result: 'moon' | 'timedOut' | 'sovietsWon'}`.
- **Sim API**: `runTrials({games, tuning, policy}): Stats` (win rate, score distribution, per-mission failure rates).
- **Data API**: `loadCards(): Card[]`, `loadMissions(): Mission[]`, etc.; `renderPrintableSheet(cards): html/pdf`.
- **UI interface**: table view (hand, piles, tech tree, tracks, mission panel, log); header controls (seed, new game, undo, save/load, rules, tuning panel in dev mode).

## Decisions & Trade-offs

- **Two decks (108 cards), 54-row table ×2 copies** — over one deck: room for identity variety and mission-outcome density; trade-off: duplicates of named people are accepted ("the bench is deep") and the table is physical-deck-sized.
- **Hybrid mapping (derivable skeleton + named identities)** — over fully bespoke: memorable during play, thematic where it counts; trade-off: less per-card uniqueness than a 54-bespoke design.
- **Suit → identity mode: ♥ Person, ♠ Equipment, ♦ Bonus, ♣ Extra action** *(OQ1 resolved)* — clean 1:1 suit↔verb ("red hearts fly, black spades fix"); trade-off: Diamonds/Clubs lose literal funding/R&D flavor, kept as naming flavor only.
- **Aces = Side Missions; Jokers = d6 event table** *(OQ1/OQ2 resolved)* — the only 42 remaining rows keep the skeleton perfectly regular; trade-off: only 2 distinct joker identities, mitigated by a 6-entry rollable table. Physical play needs one d6 *(OQ9 resolved: d6 chosen over the card-read variant and fixed jokers)*.
- **Extended named band (9–K of ♥/♣ + J–K of ♦/♠)** *(OQ2 resolved)* — face-only naming would cap people at 6+6, too few for a historical roster; trade-off: the "faces = people" rule needs one carve-out (named band extends into high Hearts/Clubs, which are the People/mode-consistent suits).
- **Roster: program-balanced iconic astronauts + hands-on engineering techs** *(OQ2 resolved)* — including **Margaret Hamilton** (flight software) and **Max Faget** (capsule design) over Katherine Johnson/Mueller per user preference; trade-off: Mercury 7 is not complete (Cooper/Schirra/Carpenter/Slayton unnamed).
- **Value curve: flat faces (s=10), ace s=12; Money=s, R&D=⌈s/2⌉, crew +⌈s/3⌉, repair=s, bonus +⌈s/2⌉** *(OQ4 resolved)* — flat faces keep named people valuable for identity, not cash; aces cash best, creating a 'fly it or fund it' dilemma; trade-off: linear-ladder fans lose the K>7 feeling. Crew bonus curve applies uniformly (named add abilities on top) so generic crew can't out-bonus names.
- **Techs flex: development discount OR mission support** *(OQ2 boundary resolved)* — mirrors astronauts' calm/crisis duality; trade-off: one more choice point per tech card.
- **Rank-vs-difficulty outcomes (contextual luck)** — over fixed outcome labels: the same card is good or bad depending on the phase; trade-off: slightly more arithmetic per draw.
- **One shared fate deck** — hand draws and outcome draws feed the same pool, so spending cards thins the deck of good outcomes and vice versa; trade-off: less ability to tune "fate" independently — mitigated by the balance harness.
- **Two universal modes + one identity mode per card** — keeps "how do I use this card?" a real but readable dilemma; trade-off: identity modes cannot be combined.
- **Two-layer hardware (tech tree + consumable equipment cards)** — permanent capability vs. in-mission repair fuel are separate systems; trade-off: two things to track, but the 54-row table isn't consumed by hardware items.
- **Dual R&D + Money costs** — preserves the two-resource tension; trade-off: more bookkeeping than a single budget.
- **Milestone-based program gating (not calendar-locked)** — recovery paths for a bad Mercury era; trade-off: less rigid historicity, softened by the campaign ladder staying chronological.
- **Explicit hardware prerequisites** — makes the tech tree meaningful and planning essential; trade-off: hard "cannot launch" walls, softened by mission retry.
- **Fixed 12-mission historical campaign with retry at +2 difficulty** *(OQ3 resolved)* — clear sequence, scoring, and pacing across 30 turns; trade-off: less variety per playthrough than mission decks.
- **Scaled phase chains + base+offset difficulty formula** *(OQ3 resolved)* — natural difficulty curve with mental-math rule; trade-off: per-phase authorship would give finer control (harness can override constants).
- **Pre-bid + post-repair resolution window (3/6 repair costs)** — decisions before and after the draw; trade-off: slightly longer resolution than "draw then fix".
- **Injured-not-dead crew (incl. Apollo 1 fire as stun-only)** — keeps it a strategy game; trade-off: loses the tragedy of history.
- **Fixed-rate Soviet drift (36 spaces, +1/turn) + event/failure pushes, milestone bites (−1 VP / −3 Money), player wins ties** *(OQ4/OQ10 resolved)* — over "discarded cards accumulate": predictable tension, far less bookkeeping; trade-off: the player's own waste no longer feeds the race — the accumulate-cards variant was **dropped entirely** per user decision. The 36-space length (over the original 30) is the arithmetic fix: expected movement ≈ 37 over 30 turns against a typical Apollo 11 at turn ~28 (harness-calibrated, M3).
- **Permanent crew pool + injury = 2 mission launches (heals at year end)** *(OQ7 resolved)* — makes "injured crew" and techs' ongoing flex role coherent; trade-off: people cards leave the fate-deck circulation once recruited (mitigated: they can be burned as repair fuel, re-entering the discard pile).
- **Side missions: one draw vs difficulty 4, unique perks, additive wording** *(OQ6 resolved)* — fast resolution with real risk (failure = Soviet +1); trade-off: less narrative than a two-phase check.
- **d6 event rolls for physical play** *(OQ9 resolved)* — one trivial component beats perturbing the fate deck (card-read variant) or losing event variety (fixed jokers).
- **4-page printable kit incl. scorepad & mission-status sheet** *(OQ8 resolved)* — more printing, but replaces improvised bookkeeping in a 30-turn game.
- **Named ability table accepted** *(OQ12 resolved)* — shapes locked (astronauts: phase-type boosts; techs: dev discount + mission support), numbers tunable; trade-off: Kraft/Kranz/Grissom are strong and may need harness-driven nerfs.
- **Events trigger on draw via d6 table (3 bad / 2 good / 1 relief)** *(OQ2 resolved)* — one timing rule; mid-mission events are thematic; trade-off: pure luck swings, bounded by the tone split.
- **VP + named victory tiers** *(OQ3/OQ4 resolved)* — partial credit keeps a 30-turn game meaningful when behind; trade-off: a "score race vs Soviets" meta is out of scope.
- **Instant single-mission resolution** — punchy, matches 30 turns; trade-off: no long-running parallel flights (possible expansion).
- **TS rules engine + React/Vite, full table sim + balance harness** — invests up front in balance (the core risk of a solitaire design); trade-off: more initial engineering than a throwaway prototype.

## Open Questions

*All design-level open questions (OQ1–OQ12) are resolved, and the balance-validation checklist below is closed by the M3 harness (`npm run sim`; three bracketing policies, 10,000 games each). Remaining work is rules design, not numbers — see the observation at the end.*

- **Race calibration — ✅ validated** *(baseline win rate in band)*: baseline **35.3%** wins (band 30–40%), aggressive **45.6%** (cap ~60%), conservative 11.6% (the low bracket); skilled win rate = 45.6%. Event pushes were tuned +2/+3 → **+6/+4** and the Soyuz relief −3 → **−2** to compensate for near-zero mission failures at skilled play (observation below); drift +1/turn, the 36-space track, failure +3 and the milestone bites all held. Typical Apollo 11 lands turn ~28 against Soviet landings in the turn 25–30 window.
- **Economy — ✅ validated**: the FR4.2 tech-cost list was raised ~2.5× (numbers updated in FR4.2) so Apollo hardware **finishes by turn ~26** on average (p90 28 — checklist target ~27) and 0/0 starting resources held. No degenerate cash-grinding: resources rarely bank above ~10, and 0/0 starts stay tight through turn 30 (only ~2% of games that survive to turn 30 fail to finish hardware).
- **Ability numbers — ✅ unchanged**: no dominance detected across 30,000 simulated games; Kraft/Kranz/Grissom never skew outcomes (see observation: phases rarely fail at skilled play, so once-per-mission prompts rarely fire).
- **Tier thresholds — ✅ recalibrated** *(70/55 → **75/65**, 45/30 → **55/45**; FR10.2 updated)*: the original cuts predated the score distribution — every simulated moon game scored ≥55 and 43% of wins hit "Distinguished". Observed moon scores: p50 69 / p90 74 (max 87); timedOut p50 51 / p90 58. The new cuts yield Distinguished ≈ 6% of wins, NASA Administrator ≈ 83%, Mission Accomplished ≈ 11%; Honorable Mention ≈ 29% of timeouts.
- **Side-mission calibration — ✅ validated**: difficulty 4 / retry +1 stands — ~20% of flights fail (≈85% first-try success), matching the intended risk/reward; the perks earn their keep (most games fly most aces) without deciding outcomes.

**Observation for future rules design (not a numbers problem)**: at skilled play, mission phases almost never fail — assigned crew bonuses plus the expected fate draw overwhelm the FR5.3 difficulty bases, so the repair/retry/injury machinery rarely engages and the race carries nearly all the tension. Fixing that would need rule-level changes (difficulty bases or the crew ⌈s/3⌉ curve), outside the sanctioned tuning levers, so it is recorded here rather than changed.

## Explored Code References

- Workspace `6 - Space Race/` is empty (no existing code, README, or config) — greenfield project; no prior conventions to inherit.
- Therefore all architecture above (engine/sim/web/data layout) is proposed net-new for this project.

## Appendix A — Printable Kit Draft (4 pages, A4, B&W print-safe)

First draft lives at **`proposals/one-small-step-printable-kit.html`** (previewable; later reused verbatim as the prototype's print output, generated from `data/*.json`). Layout spec:

- **Page 1 — Card Reference**: legend box (universal modes, s-ladder, suit key, named band, aces/jokers), then four suit tables (13 rows each) + a jokers strip. Columns: Card · Identity · s · $ (Money = s) · R&D (⌈s/2⌉) · Identity mode. Full 54-row table with proposed card assignment — **named rows**: astronauts 9♥ Shepard, 10♥ Glenn, J♥ Grissom, Q♥ White, K♥ Armstrong, J♦ Borman, Q♦ Aldrin, K♦ Collins; techs 9♣ Faget, 10♣ Gilruth, J♣ Debus, Q♣ Kraft, K♣ Kranz, J♠ Houbolt, Q♠ Hamilton, K♠ von Braun (assignment is pure data, reshuffle freely).
- **Page 2 — Game Board**: tech-tree checklist (11 items, dual costs, program grouping + unlock note), Soviet track (36 spaces in two rows of 18, 12 named milestones at every 3rd, bite rules box, player-wins-ties reminder), event table (d6, 6 entries), phase-difficulty reference (base + offset formula, outcome bands, repair costs).
- **Page 3 — Scorepad**: 3 games per sheet; VP ledger (12 missions + 4 side missions + 3 program bonuses − failure attempts − milestone bites), victory-tier table, ending reminders, optional 12-line game log.
- **Page 4 — Mission Status Sheet**: turn-sequence box, campaign ladder table (12 missions + 4 side missions with phase chains, hardware requirements, VP, Fly/Fail/Done checkboxes), crew-pool roster (16 named people × R/I/S status boxes), 10-year × 3-turn tracker with Soviet-position fields.

Design notes: black-on-white only (structure carried by suit symbols and typography); status tracking by pencil checkboxes/tokens — no pads beyond these 4 pages; tier thresholds and named-band assignment mirror the resolved OQ decisions above.

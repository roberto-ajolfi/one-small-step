/**
 * RulesOverlay — the in-game rules reference (FR11.4, spec §7).
 *
 * A condensed restatement of `proposals/one-small-step.md` (the normative
 * ruleset) so a player never has to leave the table. Numbers shown here come
 * from `tuning.json` where they are tunable, so the reference cannot drift.
 */

import { Modal } from '../ui';
import { useGameState } from '../useGameSession';

interface Section {
  heading: string;
  body: string[];
}

export function RulesOverlay({ onClose }: { onClose: () => void }) {
  const { state } = useGameState();
  const t = state.content.tuning;

  const sections: Section[] = [
    {
      heading: 'Turn sequence',
      body: [
        `1. Draw ${t.drawPerTurn} cards from the shared fate deck.`,
        `2. Action phase: ${t.actionsPerTurn} actions — play a card (one mode), develop hardware, launch the mission, or fly a side mission. Extra action cards add +1 action.`,
        '3. Mission phase: at most one mission per turn, resolved instantly through its whole phase chain.',
        `4. Upkeep: the Soviet track drifts +${t.sovietDrift}, then the turn marker advances.`,
        `Year end: discard down to ${t.handLimit} cards, then refill. Injured crew heal.`,
      ],
    },
    {
      heading: 'Playing a card — pick one mode',
      body: [
        'Cash: the card is worth s Money.',
        'Invest: the card is worth \u2308s/2\u2309 R&D.',
        'Identity: the special use printed on the card (below).',
        'Strength s = pip for 2–10, 10 for J/Q/K, 12 for A.',
      ],
    },
    {
      heading: 'Suits and identity modes',
      body: [
        '\u2665 Hearts — Person: recruits a permanent crew member (+\u2308s/3\u2309 to mission draws); burnable as repair fuel.',
        '\u2664 Spades — Equipment: s repair points, or pre-bid +s to a phase check.',
        '\u2666 Diamonds — Bonus: hold in play, then discard for +\u2308s/2\u2309 to a draw or off a repair cost.',
        '\u2663 Clubs — Extra Action: +1 action this turn.',
        'Aces — Side Missions. Jokers — News Events (roll d6 immediately on draw).',
      ],
    },
    {
      heading: 'Crew',
      body: [
        `Missions have crew slots (Mercury ${t.crewSlots.mercury}, Gemini ${t.crewSlots.gemini}, Apollo ${t.crewSlots.apollo}). Assigned crew add +\u2308s/3\u2309 to every phase draw.`,
        'Named astronauts add a phase ability; named techs never fill crew slots — they give development discounts or mission support.',
        `Injury lasts ${t.crewInjuryLaunches} launches; a stun lasts ${t.crewStunLaunches}. Crew never die — they heal at year end.`,
      ],
    },
    {
      heading: 'Hardware',
      body: [
        'Each item costs R&D (design) and Money (production) and is permanent once developed.',
        'Programs unlock by milestones: finish Mercury missions to unlock Gemini hardware, Gemini to unlock Apollo.',
        'Missions list their hardware prerequisites — missing hardware blocks the launch.',
      ],
    },
    {
      heading: 'Missions and phase checks',
      body: [
        'Difficulty = program base (Mercury 3 / Gemini 5 / Apollo 7) + phase offset (+2 Landing/Ascent) + 1 for the program’s final mission.',
        `Retry penalty: +${t.retryPenalty} to every phase after a failed attempt. Each program’s final mission is +${t.finalMissionBonus}.`,
        'Resolve a phase: pre-bid equipment and hold Bonus cards, then draw a fate card. Total = drawn s + crew + support + perks + pre-bid + boosts.',
        'Success meets the difficulty. A shortfall of 1–3 is a Minor Failure; 4+ is Major.',
        `Repair costs ${t.repairCostMinor} (minor) or ${t.repairCostMajor} (major) points, paid with cards. Decline or underpay and the mission fails.`,
        `Failure: the launch is lost, the Soviets take +${t.sovietPushFailure}, the mission becomes retryable at +${t.retryPenalty}, and the assigned crew are injured.`,
      ],
    },
    {
      heading: 'Side missions (aces)',
      body: [
        `One action, one draw vs ${t.sideMissionDifficulty}. Success: VP +${t.sideMissionVp} and a permanent perk (each perk only once).`,
        `Failure: the Soviets take +${t.sovietPushSideMission} and the attempt may be retried at +${t.sideMissionRetry} difficulty.`,
      ],
    },
    {
      heading: 'Soviet track',
      body: [
        `36 spaces. Drift +${t.sovietDrift} per turn in Upkeep, plus pushes from events and failures.`,
        `Milestone every ${t.milestoneEvery} spaces: -${t.milestoneVpBite} VP once reached. Every ${t.moneyBiteEvery}th space also -$${t.milestoneMoneyBite}.`,
        'Space 36 is a Soviet Moon landing: total loss. Ties go to the player.',
      ],
    },
    {
      heading: 'Events (jokers)',
      body: [
        '1 Gagarin Orbits! — Soviet track +6.  2 Soviet Lunar Probe — track +4.  3 Apollo 1 Fire — lose 2 actions next turn, all crew stunned.',
        "4 Kennedy's Moon Speech — +4 R&D.  5 Congressional Windfall — +6 Money.  6 Soyuz 1 Setback — Soviet track −2.",
      ],
    },
    {
      heading: 'Scoring and endings',
      body: [
        `Score = mission VP + program bonuses (Mercury +${t.programBonuses.mercury} / Gemini +${t.programBonuses.gemini} / Apollo +${t.programBonuses.apollo}) + side missions − milestone bites − failure penalties.`,
        `Moon landing tiers: ≥${t.tierThresholds.moon.distinguished} Distinguished Service Medal, ≥${t.tierThresholds.moon.administrator} NASA Administrator, else Mission Accomplished.`,
        `Timed out (turn 30): ≥${t.tierThresholds.timedOut.honorable} Honorable Mention, ≥${t.tierThresholds.timedOut.good} Good Effort, else Budget Overrun.`,
      ],
    },
  ];

  return (
    <Modal title="Rules reference" eyebrow="one small step" onClose={onClose} maxWidth="lg">
      <div className="flex flex-col gap-5">
        {sections.map((section) => (
          <section key={section.heading}>
            <h3 className="rule text-label uppercase text-ink">{section.heading}</h3>
            <ul className="mt-2 flex flex-col gap-1">
              {section.body.map((line) => (
                <li key={line} className="text-micro leading-relaxed text-ink-soft">
                  {line}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="border-t border-ink/20 pt-3 text-micro text-ink-faint">
          The design document <em>one-small-step.md</em> is the normative ruleset; this is a summary.
        </p>
      </div>
    </Modal>
  );
}

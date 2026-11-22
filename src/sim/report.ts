/**
 * Report — the human-readable balance report printed by `sim/cli.ts`
 * (spec §6: "prints a band report (target vs observed)").
 *
 * Pure text rendering over `Stats`; keeps the CLI down to I/O plumbing.
 */

import type { Band, Stats } from './stats';

const PCT = (fraction: number): string => `${(fraction * 100).toFixed(1)}%`;

function bar(count: number, max: number): string {
  const width = max === 0 ? 0 : Math.round((count / max) * 24);
  return '█'.repeat(width);
}

function turnLine(summary: Stats['apollo11Turns']): string {
  if (summary.games === 0) return '  never';
  const peak = Math.max(...summary.histogram);
  const rows: string[] = [];
  for (let turn = 1; turn < summary.histogram.length; turn++) {
    const count = summary.histogram[turn];
    if (count === 0) continue;
    rows.push(`  turn ${String(turn).padStart(2)} ${String(count).padStart(6)} ${bar(count, peak)}`);
  }
  return rows.join('\n');
}

/** Renders the full balance report including the band verdicts. */
export function renderReport(stats: Stats, bands: readonly Band[]): string {
  const { meta } = stats;
  const total = stats.meta.games;
  const lines: string[] = [];

  lines.push('One Small Step — balance report');
  lines.push(
    `policy ${meta.policy} · ${meta.games} games · seed "${meta.seed}" · ${meta.workers} worker(s) · ` +
      `${(meta.elapsedMs / 1000).toFixed(1)} s · ${Math.round(meta.gamesPerSecond)} games/s`,
  );
  lines.push('');

  lines.push('Results');
  for (const result of ['moon', 'timedOut', 'sovietsWon'] as const) {
    lines.push(`  ${result.padEnd(11)} ${String(stats.results[result]).padStart(6)}  ${PCT(stats.results[result] / (total || 1))}`);
  }

  lines.push('');
  lines.push('Tiers');
  for (const [tier, count] of Object.entries(stats.tiers).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${tier.padEnd(26)} ${String(count).padStart(6)}  ${PCT(count / (total || 1))}`);
  }

  lines.push('');
  lines.push('Scores (VP)');
  lines.push(
    `  mean ${stats.scores.mean.toFixed(1)} · min ${stats.scores.min} · max ${stats.scores.max} · ` +
      `p10 ${stats.scores.p10} · p50 ${stats.scores.p50} · p90 ${stats.scores.p90}`,
  );
  const peak = Math.max(...stats.scores.histogram.map((h) => h.count), 1);
  for (const bucket of stats.scores.histogram) {
    if (bucket.count === 0) continue;
    lines.push(`  ${bucket.label.padStart(5)} ${String(bucket.count).padStart(6)} ${bar(bucket.count, peak)}`);
  }
  for (const result of ['moon', 'timedOut'] as const) {
    const s = stats.scoresByResult[result];
    lines.push(`  ${result}: mean ${s.mean.toFixed(1)} · p50 ${s.p50} · p90 ${s.p90}`);
  }

  lines.push('');
  lines.push('Campaign ladder (per-mission failure + retry rates)');
  for (const mission of stats.missions) {
    lines.push(
      `  ${String(mission.index + 1).padStart(2)}. ${mission.name.padEnd(28)} ` +
        `reached ${String(mission.reached).padStart(6)} (${PCT(mission.reached / (total || 1))})  ` +
        `fail/game ${mission.failRate.toFixed(2)}  retry ${PCT(mission.retryRate)}`,
    );
  }

  lines.push('');
  lines.push('Side missions (difficulty 4, retry +1)');
  for (const side of stats.sideMissions) {
    lines.push(
      `  ${side.name.padEnd(28)} flown ${String(side.flown).padStart(6)}  fails ${String(side.fails).padStart(6)}  fail rate ${PCT(side.failRate)}`,
    );
  }

  lines.push('');
  lines.push('Race');
  lines.push(`  Apollo 11 landing (${stats.apollo11Turns.games} games) · mean turn ${stats.apollo11Turns.mean.toFixed(1)} · p90 ${stats.apollo11Turns.p90}`);
  lines.push(turnLine(stats.apollo11Turns));
  lines.push(`  Soviet landing (${stats.sovietLandingTurns.games} games) · mean turn ${stats.sovietLandingTurns.mean.toFixed(1)} · p90 ${stats.sovietLandingTurns.p90}`);
  lines.push(turnLine(stats.sovietLandingTurns));
  lines.push(
    `  Apollo hardware complete in ${stats.apolloHardwareTurn.games} games (${PCT(stats.apolloHardwareTurn.coverage)}) · ` +
      `mean turn ${stats.apolloHardwareTurn.mean.toFixed(1)} · p90 ${stats.apolloHardwareTurn.p90}`,
  );
  lines.push(
    `  Milestone bites: mean ${stats.milestoneBites.meanVp.toFixed(2)} VP · ${stats.milestoneBites.meanMoney.toFixed(2)} money bites/game`,
  );

  lines.push('');
  lines.push('Economy (mean resources at year start)');
  for (const row of stats.resourcesByYear) {
    lines.push(`  ${row.year}  $${row.meanMoney.toFixed(1)}  R&D ${row.meanRd.toFixed(1)}`);
  }

  lines.push('');
  lines.push('Bands (target vs observed)');
  if (bands.length === 0) {
    lines.push('  (no bands for this policy — informational run)');
  }
  for (const band of bands) {
    lines.push(`  [${band.pass ? 'PASS' : 'FAIL'}] ${band.label.padEnd(38)} target ${band.target.padEnd(10)} observed ${band.observed}`);
  }

  lines.push('');
  lines.push(`Anomalies: ${stats.anomalies.length}`);
  for (const anomaly of stats.anomalies.slice(0, 5)) {
    lines.push(`  ${anomaly.seed}: ${anomaly.error}`);
  }

  return lines.join('\n');
}

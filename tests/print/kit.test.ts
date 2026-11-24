/**
 * Print snapshot (spec §9) — the generated kit vs the golden draft.
 *
 * `renderKit()` output is compared page by page against
 * `proposals/one-small-step-printable-kit.html` as extracted text content
 * (structure and wording, not pixels). The golden draft is the visual
 * reference, but two documented deltas are normalized before comparing:
 *
 * 1. the draft's "(draft)" footer tag — the generated kit is the release copy;
 * 2. the draft's scorepad TOTAL max "69" — FR10.1 makes the max 79 (the draft
 *    total omits the three program-bonus rows); the generator computes it.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { content } from '../../src/data';
import { renderKit } from '../../src/print';

const GOLDEN_PATH = fileURLToPath(
  new URL('../../proposals/one-small-step-printable-kit.html', import.meta.url),
);

// --- text extraction -------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  middot: '\u00b7',
  ndash: '\u2013',
  mdash: '\u2014',
  rarr: '\u2192',
  hellip: '\u2026',
  rsquo: '\u2019',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/** Tags that end a text unit (rows, cells, headings, paragraphs, line breaks). */
const SPLIT_TAGS = /<\/?(?:td|th|tr|h1|h2|h3|div|p|br|table|li)\b[^>]*>/gi;

/** Extracts the significant text units of an HTML fragment, whitespace-normalized. */
function textUnits(html: string): string[] {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(SPLIT_TAGS, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((line) => decodeEntities(line).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

/** Splits a kit document into its four `.page` sections. */
function pageSections(html: string): string[] {
  return html.split('<div class="page">').slice(1);
}

/** The golden's text units with the two documented deltas (see header). */
function goldenUnits(): string[][] {
  return pageSections(readFileSync(GOLDEN_PATH, 'utf8')).map((section) => {
    const units = textUnits(section).map((unit) => unit.replace(' (draft)', ''));
    const total = units.indexOf('TOTAL SCORE');
    if (total !== -1) {
      expect(units[total + 1]).toBe('69'); // draft bug pinned — see header note 2
      units[total + 1] = '79';
    }
    return units;
  });
}

// --- checks ----------------------------------------------------------------

describe('printable kit generator', () => {
  const html = renderKit(content);
  const pages = pageSections(html);

  it('renders four standalone pages ready for browser print-to-PDF', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(pages).toHaveLength(4);
    expect(html).toContain('page-break-after: always');
    // Spec §1: no raster images anywhere — identity is type and symbols.
    expect(html).not.toMatch(/<img|url\(/);
  });

  it('matches the golden kit draft text content, page by page', () => {
    const golden = goldenUnits();
    expect(golden).toHaveLength(4);
    pages.forEach((section, index) => {
      expect(textUnits(section)).toEqual(golden[index]);
    });
  });

  it('totals the scorepad from its own VP rows (FR10.1)', () => {
    const units = textUnits(pages[2]);
    const total = units.indexOf('TOTAL SCORE');
    expect(units[total + 1]).toBe('79'); // 61 ladder + 8 side + 10 program bonus
    expect(units[total + 1]).toBe(
      String(
        content.missions.reduce((sum, mission) => sum + mission.vp, 0) +
          4 * content.tuning.sideMissionVp +
          content.tuning.programBonuses.mercury +
          content.tuning.programBonuses.gemini +
          content.tuning.programBonuses.apollo,
      ),
    );
  });
});

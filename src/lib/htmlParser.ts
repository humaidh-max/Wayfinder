import * as cheerio from 'cheerio';
import type { HtmlTable, PageHeading, PageLink } from '../types/agent';
import { resolveAbsoluteHref } from './urlUtils';

export interface ParsedPageSection {
  heading: string;
  level: number;
  content: string;
}

export interface ParsedHtmlDocument {
  title: string;
  description: string;
  headings: PageHeading[];
  sections: ParsedPageSection[];
  cleanText: string;
  textPreview: string;
  wordCount: number;
  links: PageLink[];
  tables: HtmlTable[];
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function extractHtmlTables(html: string): HtmlTable[] {
  const $ = cheerio.load(html);
  const tables: HtmlTable[] = [];

  $('table').each((tableIndex, tableEl) => {
    const caption =
      normalizeWhitespace($(tableEl).find('caption').first().text()) ||
      normalizeWhitespace($(tableEl).prevAll('h2, h3, h4').first().text()) ||
      `Table ${tableIndex + 1}`;

    const headers: string[] = [];
    const headerRow = $(tableEl).find('thead tr').first();
    if (headerRow.length > 0) {
      headerRow.find('th, td').each((_, cell) => {
        headers.push(normalizeWhitespace($(cell).text()));
      });
    } else {
      const firstTr = $(tableEl).find('tr').first();
      if (firstTr.find('th').length > 0) {
        firstTr.find('th, td').each((_, cell) => {
          headers.push(normalizeWhitespace($(cell).text()));
        });
      }
    }

    const rows: string[][] = [];
    const bodyRows =
      $(tableEl).find('tbody tr').length > 0
        ? $(tableEl).find('tbody tr')
        : $(tableEl).find('tr');

    bodyRows.each((rowIdx, trEl) => {
      if (headers.length > 0 && rowIdx === 0 && $(tableEl).find('thead').length === 0) {
        const hasOnlyTh = $(trEl).find('th').length > 0 && $(trEl).find('td').length === 0;
        if (hasOnlyTh) {
          return;
        }
      }
      const cells: string[] = [];
      $(trEl)
        .find('td, th')
        .each((_, cell) => {
          cells.push(normalizeWhitespace($(cell).text()));
        });
      if (cells.some((c) => c.length > 0)) {
        rows.push(cells);
      }
    });

    if (headers.length > 0 || rows.length > 0) {
      tables.push({
        caption,
        headers,
        rows: rows.slice(0, 60),
      });
    }
  });

  return tables;
}

export function parseHtmlDocument(html: string, baseUrl: string): ParsedHtmlDocument {
  const $ = cheerio.load(html);

  const title =
    normalizeWhitespace($('title').first().text()) ||
    normalizeWhitespace($('h1').first().text()) ||
    baseUrl;

  const description =
    normalizeWhitespace($('meta[name="description"]').attr('content') || '') ||
    normalizeWhitespace($('meta[property="og:description"]').attr('content') || '');

  // Strip non-content tags before extracting readable text and structure
  $(
    'script, style, noscript, iframe, svg, canvas, template, [aria-hidden="true"]'
  ).remove();

  const tables = extractHtmlTables($.html());

  // Extract links before removing nav/footer so the agent can navigate menus
  const seenHrefs = new Set<string>();
  const links: PageLink[] = [];
  $('a[href]').each((_, el) => {
    const rawHref = $(el).attr('href') || '';
    const resolved = resolveAbsoluteHref(rawHref, baseUrl);
    if (!resolved || seenHrefs.has(resolved)) {
      return;
    }

    const text = normalizeWhitespace(
      $(el).text() || $(el).attr('aria-label') || $(el).attr('title') || ''
    );
    if (!text || text.length < 2) {
      return;
    }

    seenHrefs.add(resolved);
    const parentNav = $(el).closest('nav, header, footer, main, aside');
    const section = parentNav.length > 0 ? parentNav.prop('tagName')?.toLowerCase() : undefined;
    links.push({
      text: text.slice(0, 120),
      href: resolved,
      section,
    });
  });

  const headings: PageHeading[] = [];
  const sections: ParsedPageSection[] = [];
  const mainContainer = $('main, article, [role="main"]').first();
  const rootScope = mainContainer.length > 0 ? mainContainer : $('body');

  const headingNodes = rootScope.find('h1, h2, h3, h4');
  headingNodes.each((_, el) => {
    const tag = ($(el).prop('tagName') || 'h2').toLowerCase();
    const level = Number.parseInt(tag.replace('h', ''), 10) || 2;
    const text = normalizeWhitespace($(el).text());
    if (!text) {
      return;
    }
    headings.push({ level, text });

    // Collect sibling text until the next heading of equal or higher priority
    const collected: string[] = [];
    let sibling = $(el).next();
    let guard = 0;
    while (sibling.length > 0 && guard < 40) {
      guard += 1;
      const sibTag = (sibling.prop('tagName') || '').toLowerCase();
      if (/^h[1-4]$/.test(sibTag)) {
        const sibLevel = Number.parseInt(sibTag.replace('h', ''), 10);
        if (sibLevel <= level) {
          break;
        }
      }
      const chunk = normalizeWhitespace(sibling.text());
      if (chunk) {
        collected.push(chunk);
      }
      sibling = sibling.next();
    }

    sections.push({
      heading: text,
      level,
      content: collected.join('\n').slice(0, 4000),
    });
  });

  // Produce clean readable text from main content blocks
  const blockTexts: string[] = [];
  rootScope
    .find('h1, h2, h3, h4, p, li, dt, dd, blockquote, tr')
    .each((_, el) => {
      const text = normalizeWhitespace($(el).text());
      if (text.length > 0) {
        blockTexts.push(text);
      }
    });

  const cleanText =
    blockTexts.length > 0
      ? blockTexts.join('\n')
      : normalizeWhitespace(rootScope.text());

  const words = cleanText ? cleanText.split(/\s+/).filter(Boolean) : [];
  const textPreview = cleanText.slice(0, 2600);

  return {
    title,
    description,
    headings: headings.slice(0, 40),
    sections,
    cleanText,
    textPreview,
    wordCount: words.length,
    links: links.slice(0, 80),
    tables,
  };
}

export interface PassageMatch {
  snippet: string;
  matchCount: number;
}

export function searchDocumentPassages(
  cleanText: string,
  query: string,
  maxMatches = 8
): PassageMatch[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9._-]/g, ''))
    .filter((t) => t.length >= 2);

  if (terms.length === 0 || !cleanText.trim()) {
    return [];
  }

  const lines = cleanText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const scored: PassageMatch[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i += 1) {
    const lower = lines[i].toLowerCase();
    let count = 0;
    for (const term of terms) {
      if (lower.includes(term)) {
        count += 1;
      }
    }
    if (count > 0) {
      const start = Math.max(0, i - 1);
      const end = Math.min(lines.length, i + 2);
      const snippet = lines.slice(start, end).join(' — ').slice(0, 480);
      if (!seen.has(snippet)) {
        seen.add(snippet);
        scored.push({ snippet, matchCount: count });
      }
    }
  }

  return scored
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, maxMatches);
}

export function extractSectionByHeading(
  doc: ParsedHtmlDocument,
  headingQuery: string
): ParsedPageSection | null {
  const needle = headingQuery.trim().toLowerCase();
  if (!needle) {
    return null;
  }

  const exact = doc.sections.find((s) => s.heading.toLowerCase() === needle);
  if (exact) {
    return exact;
  }

  const partial = doc.sections.find((s) =>
    s.heading.toLowerCase().includes(needle)
  );
  if (partial) {
    return partial;
  }

  const words = needle.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length === 0) {
    return null;
  }

  let best: ParsedPageSection | null = null;
  let bestScore = 0;
  for (const section of doc.sections) {
    const hLower = section.heading.toLowerCase();
    const score = words.filter((w) => hLower.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = section;
    }
  }

  return best;
}

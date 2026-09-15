/**
 * Facet filtering for the marketplace listing: the category shelves and the
 * keyword tags a bundle carries.
 *
 * Ported from app-registry's Explore page — and kept identical to the desktop
 * app's copy — so the three surfaces that list the same bundles slice them the
 * same way. Keep them in step.
 *
 * ⚠️ THE FACETS ARE DERIVED FROM THE LISTING, NEVER FROM `CATEGORIES`. A chip
 * row of ten shelves where eight return nothing reads as a broken filter
 * rather than an empty shelf — measured against apps.calimero.network, only
 * two of the ten categories have a single app in them today. So a chip exists
 * only when at least one app is behind it, which also means the row grows by
 * itself as publishers start declaring the field.
 */

import { CATEGORIES } from './registry';
import { formatCategory } from './appCards';

/** One selectable chip: the value to filter on, its label and its size. */
export interface Facet {
  id: string;
  label: string;
  count: number;
}

/** What the chip rows currently select. `category` is `''` when none is. */
export interface FacetSelection {
  category: string;
  tags: string[];
}

/**
 * The shape the facet helpers read — a subset of `AppSummary`.
 *
 * ⚠️ `| undefined` SPELLED OUT, because this project builds with
 * `exactOptionalPropertyTypes`. Without it an `AppSummary` — whose `category`
 * is genuinely absent on most bundles — is not assignable here at all.
 */
export interface Facetable {
  category?: string | undefined;
  tags?: string[] | undefined;
}

const CATEGORY_SET: ReadonlySet<string> = new Set<string>(CATEGORIES);

const norm = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

/**
 * A bundle's keyword tags: normalised, de-duplicated, and with the category
 * slugs taken out.
 *
 * ⚠️ THE CATEGORY SLUGS HAVE TO GO. Publishers declare the category AS A TAG
 * today — `resolveCategory` exists for exactly that reason — so leaving them in
 * would draw "communication" in both rows, where pressing either chip filters
 * to the same set and the two rows look like a bug.
 */
export function keywordTags(tags?: readonly string[] | null): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = norm(raw);
    if (!tag || CATEGORY_SET.has(tag) || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/**
 * The category chips, in the registry's own declared order rather than by
 * size: the shelves then keep their positions as the listing changes, so the
 * chip you pressed last time is where you left it.
 */
export function categoryFacets(apps: readonly Facetable[]): Facet[] {
  const counts = new Map<string, number>();
  for (const app of apps) {
    const category = norm(app.category);
    if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return CATEGORIES.filter((c) => counts.has(c)).map((c) => ({
    id: c,
    label: formatCategory(c) ?? c,
    count: counts.get(c) ?? 0,
  }));
}

/**
 * The keyword chips, commonest first.
 *
 * Unlike the categories there is no canonical order and no fixed vocabulary —
 * a tag is whatever the publisher typed — so the most useful ones are the ones
 * that actually group apps together. Ties break alphabetically so the row is
 * stable between renders.
 *
 * ⚠️ LABELLED VERBATIM, NOT TITLE-CASED. Tags in the wild are things like
 * `crdt` and `p2p`; "Crdt" is just wrong. The lower case is also what tells a
 * keyword chip apart from a Title Case shelf chip at a glance.
 */
export function tagFacets(apps: readonly Facetable[]): Facet[] {
  const counts = new Map<string, number>();
  for (const app of apps) {
    for (const tag of keywordTags(app.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

/**
 * Does one app survive the chip rows?
 *
 * Categories are single-select (an app has exactly one shelf, so two would
 * always return nothing) and the tags are ANDed: every chip you add narrows
 * the result, which is the only reading under which a row of filters can never
 * surprise you by growing the list.
 */
export function matchesFacets(
  app: Facetable,
  selection: FacetSelection,
): boolean {
  if (selection.category && norm(app.category) !== selection.category) {
    return false;
  }
  if (selection.tags.length > 0) {
    const tags = new Set(keywordTags(app.tags));
    if (!selection.tags.every((t) => tags.has(t))) return false;
  }
  return true;
}

/** Add or remove one tag from the selection, preserving the rest. */
export function toggleTag(selected: readonly string[], tag: string): string[] {
  return selected.includes(tag)
    ? selected.filter((t) => t !== tag)
    : [...selected, tag];
}

/**
 * How many keyword chips to show before the row collapses behind "+N more".
 *
 * The registry publishes 40-odd distinct tags across 21 bundles, so an
 * uncapped row is taller than the first line of cards and pushes the listing
 * itself below the fold — the thing the filters exist to help you read.
 */
export const TAG_CHIP_LIMIT = 12;

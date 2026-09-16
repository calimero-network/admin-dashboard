/**
 * Facet filtering for the marketplace listing: the category shelves.
 *
 * There was a second row here, one chip per keyword tag a bundle declares. It
 * is gone. The registry's 21 bundles carry 40-odd distinct tags between them,
 * so the row was mostly chips matching a single app — the listing already
 * shows you that app — and it cost more vertical space than the cards it was
 * meant to help you find. The tags themselves are still on each app's page,
 * where they describe one bundle instead of pretending to be a taxonomy.
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

/** What the chip row currently selects. `category` is `''` when none is. */
export interface FacetSelection {
  category: string;
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
}

const norm = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

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
 * Does one app survive the chip row?
 *
 * Single-select: an app sits on exactly one shelf, so two selected categories
 * would always return nothing.
 */
export function matchesFacets(
  app: Facetable,
  selection: FacetSelection,
): boolean {
  if (selection.category && norm(app.category) !== selection.category) {
    return false;
  }
  return true;
}

import { describe, it, expect } from 'vitest';
import { categoryFacets, matchesFacets } from '../utils/appFilters';

const app = (category?: string) => ({ category });

describe('categoryFacets', () => {
  it('offers only categories that have apps behind them', () => {
    const facets = categoryFacets([app('games'), app('games'), app(undefined)]);
    expect(facets).toEqual([{ id: 'games', label: 'Games', count: 2 }]);
  });

  it("keeps the registry's declared order, not a size order", () => {
    // `games` is declared before `developer-tools` even though it is smaller;
    // ordering by count would make chips hop about as the listing changes.
    const facets = categoryFacets([
      app('developer-tools'),
      app('developer-tools'),
      app('games'),
    ]);
    expect(facets.map((f) => f.id)).toEqual(['games', 'developer-tools']);
  });

  it('uses the human label for the two-word slugs', () => {
    expect(categoryFacets([app('art-design')])[0]?.label).toBe('Art & Design');
  });
});

describe('matchesFacets', () => {
  const none = { category: '' };

  it('passes everything when nothing is selected', () => {
    expect(matchesFacets(app(undefined), none)).toBe(true);
  });

  it('filters to one shelf', () => {
    expect(matchesFacets(app('games'), { category: 'games' })).toBe(true);
    expect(matchesFacets(app('social'), { category: 'games' })).toBe(false);
    expect(matchesFacets(app(undefined), { category: 'games' })).toBe(false);
  });

  it('ignores the tags a bundle carries — they are no longer a facet', () => {
    // A bundle's tags still exist on the wire and still show on its own page.
    // They just do not filter the listing any more, so an app is judged on its
    // category alone.
    const chat = { category: 'communication', tags: ['chat', 'e2ee'] };
    expect(matchesFacets(chat, { category: 'communication' })).toBe(true);
    expect(matchesFacets(chat, { category: 'games' })).toBe(false);
  });
});

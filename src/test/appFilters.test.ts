import { describe, it, expect } from 'vitest';
import {
  categoryFacets,
  keywordTags,
  matchesFacets,
  tagFacets,
  toggleTag,
} from '../utils/appFilters';

const app = (category?: string, tags?: string[]) => ({ category, tags });

describe('keywordTags', () => {
  it('drops the category slugs, which publishers declare AS tags', () => {
    // The live bundles carry `tags: ["communication", "chat"]` and no
    // top-level category, so without this the same word chips both rows.
    expect(keywordTags(['communication', 'chat'])).toEqual(['chat']);
  });

  it('normalises case and whitespace and de-duplicates', () => {
    expect(keywordTags([' CRDT ', 'crdt', 'p2p'])).toEqual(['crdt', 'p2p']);
  });

  it('survives a missing or malformed tag list', () => {
    expect(keywordTags(undefined)).toEqual([]);
    expect(keywordTags(null)).toEqual([]);
    expect(keywordTags([undefined as unknown as string, ''])).toEqual([]);
  });
});

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

describe('tagFacets', () => {
  it('ranks by count, then alphabetically', () => {
    const facets = tagFacets([
      app('games', ['multiplayer', 'voxel']),
      app('games', ['multiplayer']),
      app(undefined, ['crdt']),
    ]);
    expect(facets).toEqual([
      { id: 'multiplayer', label: 'multiplayer', count: 2 },
      { id: 'crdt', label: 'crdt', count: 1 },
      { id: 'voxel', label: 'voxel', count: 1 },
    ]);
  });

  it('never offers a category slug as a keyword chip', () => {
    expect(
      tagFacets([app('games', ['games', 'puzzle'])]).map((f) => f.id),
    ).toEqual(['puzzle']);
  });
});

describe('matchesFacets', () => {
  const none = { category: '', tags: [] };

  it('passes everything when nothing is selected', () => {
    expect(matchesFacets(app(undefined, undefined), none)).toBe(true);
  });

  it('filters to one shelf', () => {
    expect(matchesFacets(app('games'), { ...none, category: 'games' })).toBe(
      true,
    );
    expect(matchesFacets(app('social'), { ...none, category: 'games' })).toBe(
      false,
    );
    expect(matchesFacets(app(undefined), { ...none, category: 'games' })).toBe(
      false,
    );
  });

  it('ANDs the tags: a second chip narrows, it never widens', () => {
    const chat = app('communication', ['chat', 'e2ee']);
    expect(matchesFacets(chat, { ...none, tags: ['chat'] })).toBe(true);
    expect(matchesFacets(chat, { ...none, tags: ['chat', 'e2ee'] })).toBe(true);
    expect(matchesFacets(chat, { ...none, tags: ['chat', 'voxel'] })).toBe(
      false,
    );
  });

  it('combines a shelf with a keyword', () => {
    const app1 = app('games', ['multiplayer']);
    expect(
      matchesFacets(app1, { category: 'games', tags: ['multiplayer'] }),
    ).toBe(true);
    expect(
      matchesFacets(app1, { category: 'social', tags: ['multiplayer'] }),
    ).toBe(false);
  });
});

describe('toggleTag', () => {
  it('adds, removes and leaves the rest alone', () => {
    expect(toggleTag(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleTag(['a', 'b'], 'a')).toEqual(['b']);
  });
});

import { database, searchDatabase } from './data';

describe('searchDatabase', () => {
  it('rejects queries below the minimum length or non-positive limits', () => {
    expect(searchDatabase(database, 'a')).toEqual([]);
    expect(searchDatabase(database, 'aachen', 0)).toEqual([]);
    expect(searchDatabase(database, 'aachen', -3)).toEqual([]);
    expect(searchDatabase(database, '  ')).toEqual([]);
  });

  it('honours the limit while keeping the best-ranked prefix', () => {
    const full = searchDatabase(database, 'stony', 9);
    const limited = searchDatabase(database, 'stony', 2);

    expect(limited).toHaveLength(2);
    expect(limited).toEqual(full.slice(0, 2));
  });

  it('orders results by decreasing relevance deterministically', () => {
    const results = searchDatabase(database, 'stony', 9);
    expect(results.length).toBeGreaterThan(1);
    const titles = results.map((result) => result.title);
    expect(new Set(titles).size).toBe(titles.length);
    // Sorted output is stable across repeated invocations.
    expect(searchDatabase(database, 'stony', 9).map((r) => r.title)).toEqual(
      titles,
    );
  });

  it('serves repeated queries from the cache without mutating results', () => {
    const first = searchDatabase(database, 'aachen', 9);
    const second = searchDatabase(database, 'aachen', 9);

    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  it('treats each limit as its own cache entry', () => {
    const three = searchDatabase(database, 'stony', 3);
    const nine = searchDatabase(database, 'stony', 9);

    expect(three).toHaveLength(3);
    expect(nine.length).toBeGreaterThanOrEqual(3);
    expect(nine.slice(0, 3)).toEqual(three);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildResearchWorkSurfaceHref,
  encodeResearchFindingReference,
  parseResearchFindingReference,
  parseResearchWorkSurfaceUrl,
} from './research-work-surface-url';

describe('encodeResearchFindingReference', () => {
  it('encodes kind and id with a colon separator', () => {
    expect(
      encodeResearchFindingReference({
        id: 'post-1',
        kind: 'research-source-post',
      }),
    ).toBe('research-source-post:post-1');
  });
});

describe('parseResearchFindingReference', () => {
  it('parses a valid reference', () => {
    expect(
      parseResearchFindingReference('research-trend-video:abc_1.2~x'),
    ).toEqual({
      id: 'abc_1.2~x',
      kind: 'research-trend-video',
    });
  });

  it('returns null for null or empty input', () => {
    expect(parseResearchFindingReference(null)).toBeNull();
    expect(parseResearchFindingReference('')).toBeNull();
  });

  it('returns null when the separator is missing or misplaced', () => {
    expect(parseResearchFindingReference('no-separator')).toBeNull();
    expect(parseResearchFindingReference(':leading')).toBeNull();
    expect(parseResearchFindingReference('research-source-post:')).toBeNull();
  });

  it('returns null for an unknown kind', () => {
    expect(parseResearchFindingReference('unknown-kind:id-1')).toBeNull();
  });

  it('returns null for an unsafe id', () => {
    expect(
      parseResearchFindingReference('research-source-post:bad id!'),
    ).toBeNull();
    expect(
      parseResearchFindingReference(`research-source-post:${'a'.repeat(161)}`),
    ).toBeNull();
  });
});

describe('parseResearchWorkSurfaceUrl', () => {
  it('returns canonical defaults for empty params', () => {
    const state = parseResearchWorkSurfaceUrl(new URLSearchParams());

    expect(state.isCanonical).toBe(true);
    expect(state.page).toBe(1);
    expect(state.query).toBe('');
    expect(state.requestedReference).toBeNull();
  });

  it('keeps a valid query, page, and finding as canonical', () => {
    const state = parseResearchWorkSurfaceUrl(
      new URLSearchParams({
        finding: 'research-source-post:post-1',
        page: '3',
        q: 'growth loops',
      }),
    );

    expect(state.isCanonical).toBe(true);
    expect(state.page).toBe(3);
    expect(state.query).toBe('growth loops');
    expect(state.requestedReference).toEqual({
      id: 'post-1',
      kind: 'research-source-post',
    });
  });

  it('trims a padded query and marks the url non-canonical', () => {
    const state = parseResearchWorkSurfaceUrl(
      new URLSearchParams({ q: '  spaced  ' }),
    );

    expect(state.isCanonical).toBe(false);
    expect(state.query).toBe('spaced');
    expect(state.canonicalSearchParams.get('q')).toBe('spaced');
  });

  it('drops an empty or oversized query', () => {
    const emptyState = parseResearchWorkSurfaceUrl(
      new URLSearchParams({ q: '   ' }),
    );
    expect(emptyState.isCanonical).toBe(false);
    expect(emptyState.canonicalSearchParams.has('q')).toBe(false);

    const longState = parseResearchWorkSurfaceUrl(
      new URLSearchParams({ q: 'x'.repeat(201) }),
    );
    expect(longState.isCanonical).toBe(false);
    expect(longState.query).toBe('');
  });

  it('drops invalid or redundant page values', () => {
    const invalid = parseResearchWorkSurfaceUrl(
      new URLSearchParams({ page: 'nope' }),
    );
    expect(invalid.page).toBe(1);
    expect(invalid.isCanonical).toBe(false);
    expect(invalid.canonicalSearchParams.has('page')).toBe(false);

    const redundant = parseResearchWorkSurfaceUrl(
      new URLSearchParams({ page: '1' }),
    );
    expect(redundant.page).toBe(1);
    expect(redundant.isCanonical).toBe(false);

    const tooLarge = parseResearchWorkSurfaceUrl(
      new URLSearchParams({ page: '10001' }),
    );
    expect(tooLarge.page).toBe(1);
    expect(tooLarge.isCanonical).toBe(false);
  });

  it('drops an invalid finding reference', () => {
    const state = parseResearchWorkSurfaceUrl(
      new URLSearchParams({ finding: 'bogus' }),
    );

    expect(state.requestedReference).toBeNull();
    expect(state.isCanonical).toBe(false);
    expect(state.canonicalSearchParams.has('finding')).toBe(false);
  });
});

describe('buildResearchWorkSurfaceHref', () => {
  it('returns the bare pathname when params are empty', () => {
    expect(
      buildResearchWorkSurfaceHref('/research', new URLSearchParams()),
    ).toBe('/research');
  });

  it('appends the query string when params exist', () => {
    expect(
      buildResearchWorkSurfaceHref(
        '/research',
        new URLSearchParams({ q: 'x' }),
      ),
    ).toBe('/research?q=x');
  });
});

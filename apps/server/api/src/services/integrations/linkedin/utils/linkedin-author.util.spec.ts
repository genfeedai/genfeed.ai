import {
  buildLinkedInOrganizationUrn,
  isLinkedInOrganizationUrn,
  resolveLinkedInAuthorUrn,
} from '@api/services/integrations/linkedin/utils/linkedin-author.util';

describe('resolveLinkedInAuthorUrn', () => {
  it.each([
    ['abc123_-XY', 'urn:li:person:abc123_-XY'],
    ['urn:li:person:abc123', 'urn:li:person:abc123'],
    ['urn:li:organization:5515715', 'urn:li:organization:5515715'],
  ])('maps %s to %s', (externalId, expected) => {
    expect(resolveLinkedInAuthorUrn(externalId)).toBe(expected);
  });

  it.each([
    [null, 'LinkedIn credential has no connected account'],
    [undefined, 'LinkedIn credential has no connected account'],
    ['', 'LinkedIn credential has no connected account'],
    [
      'urn:li:organization:not-a-number',
      'LinkedIn credential identity is not a member or page',
    ],
    [
      'urn:li:company:1',
      'LinkedIn credential identity is not a member or page',
    ],
    ['has space', 'LinkedIn credential identity is not a member or page'],
  ])('rejects %s', (externalId, message) => {
    expect(() => resolveLinkedInAuthorUrn(externalId)).toThrow(message);
  });
});

describe('isLinkedInOrganizationUrn', () => {
  it.each([
    ['urn:li:organization:42', true],
    ['urn:li:person:42', false],
    ['42', false],
    [null, false],
  ])('classifies %s as %s', (value, expected) => {
    expect(isLinkedInOrganizationUrn(value)).toBe(expected);
  });
});

describe('buildLinkedInOrganizationUrn', () => {
  it('prefixes a numeric organization id', () => {
    expect(buildLinkedInOrganizationUrn('5515715')).toBe(
      'urn:li:organization:5515715',
    );
  });

  it('rejects a non-numeric organization id', () => {
    expect(() => buildLinkedInOrganizationUrn('abc')).toThrow(
      'LinkedIn organization id must be numeric',
    );
  });
});

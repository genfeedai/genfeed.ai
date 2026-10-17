import { knowledgeSourceVersionSerializerConfig } from '@serializers/configs/content/knowledge-source-version.config';
import { describe, expect, it } from 'vitest';

const { provenance } =
  knowledgeSourceVersionSerializerConfig.attributeTransforms;

describe('knowledge source version provenance transform', () => {
  it('drops the initiating actor and keeps the public provenance', () => {
    expect(
      provenance({
        provenance: {
          importedFrom: 'https://example.com',
          initiatingActor: { userId: 'user-1', token: 'secret' },
        },
      }),
    ).toEqual({ importedFrom: 'https://example.com' });
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['a string', 'manual'],
    ['an array', ['a']],
  ])('passes %s provenance through untouched', (_label, value) => {
    expect(provenance({ provenance: value })).toBe(value);
  });
});

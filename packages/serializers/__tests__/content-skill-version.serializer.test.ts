import {
  SkillVersionMetadataSerializer,
  SkillVersionReadSerializer,
} from '@serializers/server/content/content-skill-version.serializer';
import { describe, expect, it } from 'vitest';

const record = {
  id: 'sv1_skill_2',
  versionNumber: 2,
  createdAt: '2026-10-02T12:00:00.000Z',
  contentHash: `sha256:skill-v1:${'a'.repeat(64)}`,
  instructionText: '',
  payload: { secret: 'body' },
  config: { source: 'paid' },
  files: ['private'],
  importProvenance: { importedByUserId: 'private' },
  creator: 'private',
  createdById: 'private',
  grants: ['private'],
  relationships: { secret: {} },
  included: [{}],
  name: 'mutable',
  slug: 'mutable',
  updatedAt: 'mutable',
  isDeleted: false,
};
describe('immutable skill-version serializer allowlists', () => {
  it('lists metadata only despite adversarial overpopulation', () => {
    expect(SkillVersionMetadataSerializer.serialize([record])).toEqual({
      data: [
        {
          type: 'skill-version',
          id: record.id,
          attributes: {
            versionNumber: 2,
            createdAt: record.createdAt,
            contentHash: record.contentHash,
          },
        },
      ],
    });
  });
  it('detail adds only exact empty or whitespace instructions', () => {
    for (const instructionText of ['', ' \n\t ']) {
      expect(
        SkillVersionReadSerializer.serialize({ ...record, instructionText }),
      ).toEqual({
        data: {
          type: 'skill-version',
          id: record.id,
          attributes: {
            versionNumber: 2,
            createdAt: record.createdAt,
            contentHash: record.contentHash,
            instructionText,
          },
        },
      });
    }
  });
});

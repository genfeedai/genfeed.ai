import {
  readJsonRecord,
  toIdString,
  toSerializableDocument,
} from '@serializers/helpers/serializable-document.helper';

export interface PatternPlaybookAttributes {
  description: unknown;
  insights: unknown;
  isActive: unknown;
  lastUpdatedAt: unknown;
  name: unknown;
  niche: unknown;
  patternsCount: unknown;
  platform: unknown;
  sourceCreators: string[];
}

export interface PatternPlaybookResource {
  attributes: PatternPlaybookAttributes;
  id: string;
  type: 'pattern-playbook';
}

/**
 * Pattern playbooks persist domain fields in a JSON `data` column.
 * `buildSerializer` would emit a JSON:API document plus createdAt/updatedAt/isDeleted
 * and would not flatten `data`, so this keeps the current resource-object wire format.
 */
export const PatternPlaybookSerializer = {
  serialize(data: unknown): PatternPlaybookResource | null {
    if (!data) {
      return null;
    }

    const doc = toSerializableDocument(data);
    const persistedData = readJsonRecord(doc.data);
    const sourceCreators = Array.isArray(doc.sourceCreators)
      ? doc.sourceCreators.filter(
          (entry): entry is string => typeof entry === 'string',
        )
      : [];

    return {
      attributes: {
        description: persistedData.description,
        insights: persistedData.insights,
        isActive: persistedData.isActive,
        lastUpdatedAt: persistedData.lastUpdatedAt,
        name: persistedData.name,
        niche: persistedData.niche,
        patternsCount: persistedData.patternsCount,
        platform: persistedData.platform,
        sourceCreators,
      },
      id: toIdString(doc.id) ?? '',
      type: 'pattern-playbook',
    };
  },
};

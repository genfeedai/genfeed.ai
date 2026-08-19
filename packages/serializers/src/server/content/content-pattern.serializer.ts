import {
  toIdString,
  toSerializableDocument,
} from '@serializers/helpers/serializable-document.helper';

export interface ContentPatternAttributes {
  description: unknown;
  extractedFormula: unknown;
  patternType: unknown;
  placeholders: unknown;
  platform: unknown;
  rawExample: unknown;
  relevanceWeight: unknown;
  sourceCreatorId: unknown;
  sourceMetrics: unknown;
  sourcePostDate: unknown;
  sourcePostUrl: unknown;
  tags: unknown;
  templateCategory: unknown;
  usageCount: unknown;
}

export interface ContentPatternResource {
  attributes: ContentPatternAttributes;
  id?: string;
  type: 'content-pattern';
}

/**
 * Content patterns persist domain fields in a JSON `data` column.
 * `buildSerializer` would change the `{ type, id, attributes }` resource-object
 * wire format, so flattening stays in this custom serialize module.
 */
export const ContentPatternSerializer = {
  serialize(data: unknown): ContentPatternResource | null {
    if (!data) {
      return null;
    }

    const doc = toSerializableDocument(data);
    const persistedData = toSerializableDocument(doc.data);

    return {
      attributes: {
        description: persistedData.description,
        extractedFormula: persistedData.extractedFormula,
        patternType: persistedData.patternType,
        placeholders: persistedData.placeholders,
        platform: persistedData.platform,
        rawExample: persistedData.rawExample,
        relevanceWeight: persistedData.relevanceWeight,
        sourceCreatorId: doc.sourceCreatorId,
        sourceMetrics: persistedData.sourceMetrics,
        sourcePostDate: persistedData.sourcePostDate,
        sourcePostUrl: persistedData.sourcePostUrl,
        tags: persistedData.tags,
        templateCategory: persistedData.templateCategory,
        usageCount: persistedData.usageCount,
      },
      id: toIdString(doc.id),
      type: 'content-pattern',
    };
  },
};

import {
  visualCodeCatalogAttributes,
  visualCodeQuoteAttributes,
  visualProjectAttributes,
} from '@serializers/attributes/content/visual-project.attributes';
import { simpleConfig } from '@serializers/builders';

const revisionKeys = [
  'id',
  'projectId',
  'number',
  'requestId',
  'status',
  'progress',
  'modelKey',
  'rendererVersion',
  'sourceHash',
  'prompt',
  'settings',
  'props',
  'sourceAssetIds',
  'maximumCredits',
  'consumedCredits',
  'receipts',
  'outputRequests',
  'outputs',
  'diagnostics',
];
export function visualProjectData(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const revisions = Array.isArray(record.revisions)
    ? record.revisions
        .map((value) => {
          if (!value || typeof value !== 'object' || Array.isArray(value))
            return null;
          const revision = value as Record<string, unknown>;
          return {
            ...Object.fromEntries(
              revisionKeys.map((key) => [key, revision[key]]),
            ),
            revisionId: revision.id,
            hasSource:
              typeof revision.sourceCode === 'string' &&
              revision.sourceCode.length > 0,
            previews: revision.preview ?? [],
          };
        })
        .filter((value) => value !== null)
    : [];
  return {
    ...Object.fromEntries(
      ['id', ...visualProjectAttributes]
        .filter((key) => key !== 'revisions')
        .map((key) => [key, record[key]]),
    ),
    revisions,
  };
}
export const visualProjectSerializerConfig = {
  ...simpleConfig('visual-project', visualProjectAttributes),
  attributeTransforms: {
    revisions: (record: Record<string, unknown>) =>
      visualProjectData(record).revisions,
  },
};
export const visualCodeCatalogSerializerConfig = simpleConfig(
  'visual-code-catalog',
  visualCodeCatalogAttributes,
);
export const visualCodeQuoteSerializerConfig = simpleConfig(
  'visual-code-quote',
  visualCodeQuoteAttributes,
);

import { createEntityAttributes } from '@genfeedai/helpers';
export const visualProjectAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'userId',
  'label',
  'currentRevision',
  'revisions',
  'nextRevisionCursor',
]);
export const visualCodeCatalogAttributes = [
  'isAvailable',
  'unavailableReason',
  'rendererVersion',
  'creditsPerSecond',
  'defaultModelKey',
  'models',
  'limits',
  'outputFormats',
  'defaultSettings',
];
export const visualCodeQuoteAttributes = [
  'unit',
  'modelKey',
  'isByok',
  'authoringCredits',
  'inspectionCredits',
  'renderCredits',
  'maximumCredits',
  'maximumAuthoringCalls',
  'maximumInspectionCalls',
  'maximumRepairs',
  'maximumRenderJobs',
  'renderDeadlineSeconds',
  'rendererVersion',
  'creditsPerSecond',
  'settings',
  'outputRequests',
];

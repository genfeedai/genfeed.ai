import { createEntityAttributes } from '@genfeedai/helpers';

export const agentBrandContextAttributes = createEntityAttributes([
  'brandId',
  'brandName',
  'budget',
  'generatedAt',
  'layerStatus',
  'layers',
  'layersUsed',
  'memories',
  'memoryPrompt',
  'model',
  'query',
  'skills',
  'systemPrompt',
]);

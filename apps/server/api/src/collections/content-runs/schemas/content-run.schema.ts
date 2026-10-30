import type { BrandRemixRunConfig } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import type { ContentRun } from '@genfeedai/prisma';

/**
 * Remix values live on `ContentRun.config` and are spread by `hydrateContentRun`.
 * Declaring them here structurally backs the serializer allowlist.
 */
export interface ContentRunDocument extends ContentRun {
  analysisSource?: BrandRemixRunConfig['analysisSource'];
  generationQuote?: BrandRemixRunConfig['generationQuote'];
  scenePipeline?: BrandRemixRunConfig['scenePipeline'];
}

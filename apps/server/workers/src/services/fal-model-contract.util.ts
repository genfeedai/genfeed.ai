import {
  classifyFalSchemaFamily,
  extractFalEndpointSchemas,
  type FalEndpointSchemas,
} from '@api/services/integrations/fal/services/fal-contract';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import {
  mapFalPricing,
  type NormalizedFalPrice,
  normalizeFalPrice,
} from '@workers/crons/fal-model-watcher/fal-pricing';
import type { IFalModel } from '@workers/interfaces/model-discovery.interface';
import { hashProviderContract } from '@workers/services/provider-contract.util';

export interface FalCandidateContract {
  billingUnit: string | null;
  conditionalDimensions: Record<string, unknown>;
  currency: string | null;
  inputSchema: Record<string, unknown>;
  mappingStatus: 'quarantined' | 'supported';
  openapi: Record<string, unknown>;
  openapiVersion: string | null;
  outputSchema: Record<string, unknown>;
  pricing: NormalizedFalPrice[];
  pricingType: string | null;
  schemaFamily: string | null;
  unitPrice: string | null;
  unitPriceMicros: bigint | null;
  unsupportedReason: string | null;
  version: string;
}

export function prepareFalModelContract(
  model: IFalModel,
  rawPrices: Array<Record<string, unknown>>,
): FalCandidateContract {
  const openapi = isRecord(model.openapi) ? model.openapi : {};
  const normalizedPrices = rawPrices.map(normalizeFalPrice);
  let schemas: FalEndpointSchemas = { input: {}, output: {} };
  let schemaFamily: string | null = null;
  let unsupportedReason: string | null = null;

  try {
    if (isRecord(openapi.error)) {
      throw new Error('OpenAPI expansion failed');
    }
    schemas = extractFalEndpointSchemas(openapi);
    schemaFamily = classifyFalSchemaFamily(
      model.metadata?.category,
      schemas.input,
      schemas.output,
    );
    if (!schemaFamily) unsupportedReason = 'unsupported_schema_family';
  } catch {
    unsupportedReason = 'invalid_or_missing_openapi';
  }

  const price = normalizedPrices.length === 1 ? normalizedPrices[0] : null;
  const pricingMapping = price ? mapFalPricing(price) : null;
  if (!price) {
    unsupportedReason ??=
      normalizedPrices.length > 1 ? 'ambiguous_pricing' : 'missing_pricing';
  } else if (pricingMapping && !pricingMapping.supported) {
    unsupportedReason ??= pricingMapping.reason;
  }

  const supported = Boolean(schemaFamily && pricingMapping?.supported);
  const candidateWithoutVersion = {
    endpoint: model.endpoint_id,
    inputSchema: schemas.input,
    openapi,
    outputSchema: schemas.output,
    pricing: normalizedPrices,
    schemaFamily,
  };

  return {
    billingUnit: price?.unit ?? null,
    conditionalDimensions: price?.conditionalDimensions ?? {},
    currency: price?.currency ?? null,
    inputSchema: schemas.input,
    mappingStatus: supported ? 'supported' : 'quarantined',
    openapi,
    openapiVersion:
      typeof openapi.openapi === 'string' ? openapi.openapi : null,
    outputSchema: schemas.output,
    pricing: normalizedPrices,
    pricingType:
      pricingMapping?.supported === true ? pricingMapping.pricingType : null,
    schemaFamily,
    unitPrice: price?.unitPrice ?? null,
    unitPriceMicros:
      pricingMapping?.supported === true
        ? pricingMapping.unitPriceMicros
        : null,
    unsupportedReason,
    version: hashProviderContract(candidateWithoutVersion),
  };
}

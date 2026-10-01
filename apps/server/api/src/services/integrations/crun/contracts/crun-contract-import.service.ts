import { createHash } from 'node:crypto';
import {
  CRUN_IMAGE_MANIFEST,
  CRUN_PRICING_SNAPSHOT,
  type CrunManifestEntry,
} from '@api/services/integrations/crun/contracts/crun-manifest';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import type {
  CrunInputField,
  CrunModelInputContract,
} from '@genfeedai/contracts/interfaces';
import { normalizeCrunInput } from '@genfeedai/helpers';
import { toPrismaJson } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('CRUN_SCHEMA_OBJECT_REQUIRED');
  return value as Record<string, unknown>;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(record(value))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

/** Input semantics are deliberately bounded. Never flatten an unknown combinator. */
function resolve(
  openapi: Record<string, unknown>,
  value: unknown,
  depth = 0,
  visited = new Set<string>(),
): Record<string, unknown> {
  if (depth > 16) throw new Error('CRUN_SCHEMA_DEPTH');
  const schema = record(value);
  if (schema.allOf || schema.anyOf || schema.oneOf || schema.not)
    throw new Error('CRUN_SCHEMA_COMBINATOR');
  if (schema.$ref !== undefined) {
    if (typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#/'))
      throw new Error('CRUN_SCHEMA_REMOTE_REFERENCE');
    if (visited.has(schema.$ref))
      throw new Error('CRUN_SCHEMA_REFERENCE_CYCLE');
    if (
      Object.keys(schema).some(
        (key) => !['$ref', 'description', 'title'].includes(key),
      )
    )
      throw new Error('CRUN_SCHEMA_REFERENCE_CONFLICT');
    let referenced: unknown = openapi;
    for (const segment of schema.$ref.slice(2).split('/'))
      referenced =
        record(referenced)[segment.replaceAll('~1', '/').replaceAll('~0', '~')];
    return resolve(
      openapi,
      referenced,
      depth + 1,
      new Set([...visited, schema.$ref]),
    );
  }
  return {
    ...schema,
    ...(schema.properties
      ? {
          properties: Object.fromEntries(
            Object.entries(record(schema.properties)).map(([key, property]) => [
              key,
              resolve(openapi, property, depth + 1, visited),
            ]),
          ),
        }
      : {}),
    ...(schema.items
      ? { items: resolve(openapi, schema.items, depth + 1, visited) }
      : {}),
  };
}

function field(value: unknown, isRequired: boolean): CrunInputField {
  const schema = record(value);
  const type = schema.type;
  if (
    !['string', 'number', 'integer', 'boolean', 'array'].includes(String(type))
  )
    throw new Error('CRUN_SCHEMA_FIELD_TYPE');
  const allowed = new Set([
    'type',
    'description',
    'title',
    'example',
    'deprecated',
    'enum',
    'default',
    'minimum',
    'maximum',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'items',
    'format',
  ]);
  if (Object.keys(schema).some((key) => !allowed.has(key)))
    throw new Error('CRUN_SCHEMA_FIELD_SEMANTICS');
  const result: CrunInputField = {
    isRequired,
    type: type as CrunInputField['type'],
  };
  for (const key of [
    'minimum',
    'maximum',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
  ] as const) {
    if (schema[key] !== undefined) {
      if (
        typeof schema[key] !== 'number' ||
        !Number.isFinite(schema[key]) ||
        schema[key] < 0
      )
        throw new Error('CRUN_SCHEMA_BOUND');
      result[key] = schema[key];
    }
  }
  for (const [minimum, maximum] of [
    ['minimum', 'maximum'],
    ['minLength', 'maxLength'],
    ['minItems', 'maxItems'],
  ] as const) {
    if (
      result[minimum] !== undefined &&
      result[maximum] !== undefined &&
      result[minimum] > result[maximum]
    )
      throw new Error('CRUN_SCHEMA_INVERTED_BOUNDS');
  }
  if (schema.format !== undefined && schema.format !== 'uri')
    throw new Error('CRUN_SCHEMA_FORMAT');
  if (schema.format === 'uri') result.format = 'uri';
  if (type === 'array') {
    const items = record(schema.items);
    if (
      items.type !== 'string' ||
      items.format !== 'uri' ||
      Object.keys(items).some(
        (key) => !['type', 'format', 'description'].includes(key),
      )
    )
      throw new Error('CRUN_SCHEMA_ARRAY_ITEMS');
    result.format = 'uri';
  }
  if (schema.enum !== undefined) {
    if (
      !Array.isArray(schema.enum) ||
      !schema.enum.length ||
      schema.enum.some(
        (item) => !['string', 'number', 'boolean'].includes(typeof item),
      )
    )
      throw new Error('CRUN_SCHEMA_ENUM');
    result.enum = schema.enum as CrunInputField['enum'];
  }
  if (schema.default !== undefined) {
    const check = normalizeCrunInput(
      {
        endpoint: '',
        fields: { value: result },
        isAutoAspectReferenceRequired: false,
        mediaKind: 'image',
        referenceRoles: {},
        serverOverrides: {},
        version: '',
      },
      { value: schema.default },
    );
    if (!check.isValid) throw new Error('CRUN_SCHEMA_DEFAULT');
    result.default = check.input.value;
  }
  return result;
}

export function buildCrunContract(
  entry: CrunManifestEntry,
  raw: unknown = entry.openapi,
  pricing: unknown = CRUN_PRICING_SNAPSHOT,
): CrunModelInputContract {
  const openapi = record(raw);
  const path = record(record(openapi.paths)['/api/v1/client/job/CreateTask']);
  const wrapper = resolve(
    openapi,
    record(
      record(record(record(path.post).requestBody).content)['application/json'],
    ).schema,
  );
  const properties = record(wrapper.properties);
  const model = record(properties.model);
  if (!Array.isArray(model.enum) || !model.enum.includes(entry.endpoint))
    throw new Error('CRUN_SCHEMA_MODEL_MISMATCH');
  const input = record(properties.input);
  if (input.type !== 'object') throw new Error('CRUN_SCHEMA_INPUT_OBJECT');
  const required = input.required ?? [];
  if (
    !Array.isArray(required) ||
    required.some((key) => typeof key !== 'string')
  )
    throw new Error('CRUN_SCHEMA_REQUIRED');
  const inputProperties = record(input.properties);
  if (required.some((key) => !Object.hasOwn(inputProperties, key)))
    throw new Error('CRUN_SCHEMA_REQUIRED_FIELD_MISSING');
  const omitted: readonly string[] = entry.overrides.omitFields;
  if (required.some((key) => omitted.includes(key)))
    throw new Error('CRUN_SCHEMA_UNSUPPORTED_REQUIRED_FIELD');
  const fields = Object.fromEntries(
    Object.entries(inputProperties)
      .filter(([key]) => !omitted.includes(key))
      .map(([key, value]) => [key, field(value, required.includes(key))]),
  );
  // This manifest launches these exact controls only; drift remains a review candidate.
  if (
    Object.keys(fields).some(
      (key) =>
        ![
          'prompt',
          'resolution',
          'aspect_ratio',
          'output_format',
          'img_urls',
        ].includes(key),
    )
  )
    throw new Error('CRUN_SCHEMA_UNSUPPORTED_FIELD');
  const contract: CrunModelInputContract = {
    endpoint: entry.endpoint,
    fields,
    isAutoAspectReferenceRequired:
      entry.overrides.isAutoAspectReferenceRequired,
    mediaKind: 'image',
    referenceRoles: { img_urls: 'image' },
    serverOverrides: { ...entry.overrides.serverOverrides },
    version: '',
  };
  contract.version = createHash('sha256')
    .update(
      canonical({
        contract,
        endpoint: entry.endpoint,
        openapi,
        overrides: entry.overrides,
        pricing,
      }),
    )
    .digest('hex');
  return contract;
}

@Injectable()
export class CrunContractImportService {
  constructor(private readonly prisma: PrismaService) {}

  async importModel(
    entry: CrunManifestEntry,
    raw: unknown = entry.openapi,
    isApply = false,
    now = new Date(),
  ) {
    let contract: CrunModelInputContract | null = null;
    let unsupportedReason: string | null = null;
    try {
      contract = buildCrunContract(entry, raw);
    } catch (error) {
      unsupportedReason =
        error instanceof Error ? error.message : 'CRUN_SCHEMA_UNSUPPORTED';
    }
    const version =
      contract?.version ??
      createHash('sha256')
        .update(
          canonical({
            endpoint: entry.endpoint,
            openapi: raw,
            overrides: entry.overrides,
            pricing: CRUN_PRICING_SNAPSHOT,
          }),
        )
        .digest('hex');
    const mappingStatus = contract ? 'supported' : 'quarantined';
    if (!isApply)
      return { contract, mappingStatus, unsupportedReason, version };
    // Platform catalog scope: these are global models, never tenant-owned imports.
    await this.prisma.$transaction(async (transaction) => {
      const model = await transaction.model.upsert({
        create: {
          category: ModelCategory.IMAGE,
          endpoint: entry.endpoint,
          isActive: false,
          isDefault: false,
          isDiscovered: true,
          isPublic: true,
          key: entry.key,
          label: entry.label,
          organizationId: null,
          provider: ModelProvider.CRUN,
          reviewStatus: 'pending',
        },
        update: {},
        where: {
          provider_endpoint: {
            endpoint: entry.endpoint,
            provider: ModelProvider.CRUN,
          },
        },
      });
      await transaction.modelProviderContract.upsert({
        create: {
          billingUnit: 'output',
          conditionalDimensions: {},
          currency: 'CRUN_CREDITS',
          endpoint: entry.endpoint,
          inputSchema: toPrismaJson(contract ?? {}),
          lastSeenAt: now,
          mappingStatus,
          modelId: model.id,
          openapi: toPrismaJson(raw),
          outputSchema: { type: 'image', maxOutputs: 1 },
          pricing: toPrismaJson(CRUN_PRICING_SNAPSHOT),
          pricingType: 'per-request',
          provider: ModelProvider.CRUN,
          reviewStatus: contract ? 'pending' : 'quarantined',
          schemaFamily: contract ? 'crun-image-v1' : null,
          unsupportedReason,
          version,
        },
        update: { lastSeenAt: now },
        where: {
          provider_endpoint_version: {
            endpoint: entry.endpoint,
            provider: ModelProvider.CRUN,
            version,
          },
        },
      });
      const isReviewed = model.reviewedProviderContractVersion === version;
      await transaction.model.update({
        data: {
          pendingProviderContractVersion: isReviewed ? null : version,
          providerPricingSyncedAt: now,
          providerSchemaSyncedAt: now,
          providerSyncFailedAt: null,
          providerSyncFailureCode: null,
          providerSyncStatus: isReviewed
            ? 'fresh'
            : contract
              ? 'review_required'
              : 'quarantined',
        },
        where: { id: model.id, isDeleted: false, organizationId: null },
      });
    });
    return { contract, mappingStatus, unsupportedReason, version };
  }

  async synchronize(now = new Date()) {
    for (const entry of CRUN_IMAGE_MANIFEST) {
      try {
        const response = await fetch(entry.schemaUrl, {
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error('CRUN_METADATA_FETCH_FAILED');
        await this.importModel(entry, await response.json(), true, now);
      } catch {
        // Platform-only bounded catalog sweep; retain reviewed input and pricing.
        await this.prisma.model.updateMany({
          data: {
            providerSyncFailedAt: now,
            providerSyncFailureCode: 'CRUN_METADATA_FETCH_FAILED',
            providerSyncStatus: 'failed',
          },
          where: {
            endpoint: entry.endpoint,
            isDeleted: false,
            organizationId: null,
            provider: ModelProvider.CRUN,
          },
        });
      }
    }
  }
}

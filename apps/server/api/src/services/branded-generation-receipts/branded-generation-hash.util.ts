import { createHash } from 'node:crypto';
import type { BrandedGenerationOperationKindV1 } from '@api/services/branded-generation-receipts/branded-generation-state.util';
import {
  brandArtifactValidationReportV1Schema,
  brandedGenerationInputV1Schema,
  brandedGenerationResolutionV1Schema,
  brandGenerationArtifactPartV1Schema,
  brandGenerationArtifactV1Schema,
  brandGenerationRulesV1Schema,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandArtifactValidationReportV1,
  BrandedGenerationInputV1,
  BrandedGenerationResolutionV1,
  BrandGenerationArtifactV1,
  BrandGenerationRulesV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
export type BrandedGenerationJsonV1 =
  | null
  | boolean
  | number
  | string
  | BrandedGenerationJsonV1[]
  | { [key: string]: BrandedGenerationJsonV1 };
export type BrandedGenerationHashDomainV1 =
  | 'brand-identity-v1'
  | 'generation-request-v1'
  | 'generation-resolution-v1'
  | 'generation-artifact-v1'
  | 'receipt-operation-v1'
  | 'brand-validation-report-v1'
  | 'brand-generation-rules-review-v1';
export interface BrandGenerationArtifactManifestInputV1 {
  mediaKind: BrandGenerationArtifactV1['mediaKind'];
  textHash: string | null;
  parts: BrandGenerationArtifactV1['parts'];
}
const domains: readonly BrandedGenerationHashDomainV1[] = [
  'brand-identity-v1',
  'generation-request-v1',
  'generation-resolution-v1',
  'generation-artifact-v1',
  'receipt-operation-v1',
  'brand-validation-report-v1',
  'brand-generation-rules-review-v1',
];
const operations: readonly BrandedGenerationOperationKindV1[] = [
  'resolve',
  'recompose',
  'dispatch',
  'bind_artifact',
  'validate',
  'revalidate',
  'fail',
  'block',
  'cancel',
  'record_costs',
  'delete',
];
function invalid(): never {
  throw new TypeError('Invalid branded generation JSON');
}
function objectDescriptors(value: object): Record<string, PropertyDescriptor> {
  if (Object.getOwnPropertySymbols(value).length) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (Array.isArray(value) && key === 'length') continue;
    if (
      !descriptor.enumerable ||
      !('value' in descriptor) ||
      ['__proto__', 'constructor', 'prototype'].includes(key)
    )
      invalid();
  }
  return descriptors;
}
function serialize(
  value: unknown,
  depth: number,
  ancestors: Set<object>,
  omitUndefined: boolean,
): string {
  if (depth > 16) invalid();
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid();
    return JSON.stringify(value);
  }
  if (typeof value !== 'object' || value === null) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (
    Array.isArray(value)
      ? prototype !== Array.prototype
      : prototype !== Object.prototype && prototype !== null
  )
    invalid();
  if (ancestors.has(value)) invalid();
  const descriptors = objectDescriptors(value);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Object.keys(descriptors).filter((key) => key !== 'length');
      if (
        keys.length !== value.length ||
        keys.some(
          (key) =>
            !/^\d+$/.test(key) ||
            String(Number(key)) !== key ||
            Number(key) >= value.length,
        )
      )
        invalid();
      const entries: string[] = [];
      for (let i = 0; i < value.length; i++) {
        const descriptor = descriptors[String(i)];
        if (!descriptor) invalid();
        entries.push(
          serialize(descriptor.value, depth + 1, ancestors, omitUndefined),
        );
      }
      return `[${entries.join(',')}]`;
    }
    const entries: string[] = [];
    for (const key of Object.keys(descriptors).sort()) {
      const entry = descriptors[key].value;
      if (omitUndefined && entry === undefined) continue;
      entries.push(
        `${JSON.stringify(key)}:${serialize(entry, depth + 1, ancestors, omitUndefined)}`,
      );
    }
    return `{${entries.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}
export function canonicalizeBrandedGenerationJsonV1(
  value: BrandedGenerationJsonV1,
): string {
  return serialize(value, 0, new Set(), false);
}
function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}
export function hashBrandedGenerationJsonV1(
  domain: BrandedGenerationHashDomainV1,
  value: BrandedGenerationJsonV1,
): string {
  if (!domains.includes(domain)) invalid();
  return digest(`${domain}\n${canonicalizeBrandedGenerationJsonV1(value)}`);
}
export function hashBrandedGenerationTextV1(text: string): string {
  if (typeof text !== 'string') invalid();
  return digest(text);
}
/** Parsed contract objects may expose known optional properties as undefined. */
function projection(value: unknown): BrandedGenerationJsonV1 {
  serialize(value, 0, new Set(), true);
  function copy(entry: unknown): BrandedGenerationJsonV1 {
    if (
      entry === null ||
      typeof entry === 'string' ||
      typeof entry === 'boolean' ||
      typeof entry === 'number'
    )
      return entry;
    if (Array.isArray(entry)) return entry.map(copy);
    const output: { [key: string]: BrandedGenerationJsonV1 } =
      Object.create(null);
    for (const [key, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(entry),
    )) {
      if (descriptor.value !== undefined) output[key] = copy(descriptor.value);
    }
    return output;
  }
  return copy(value);
}
export function hashBrandGenerationRulesReviewV1(
  rules: BrandGenerationRulesV1,
): string {
  // Validate descriptors before the canonical schema reads fields. Keep optional
  // undefined keys until schema validation so unknown fields cannot disappear.
  serialize(rules, 0, new Set(), true);
  const parsed = brandGenerationRulesV1Schema.parse(rules);
  return hashBrandedGenerationJsonV1(
    'brand-generation-rules-review-v1',
    projection(parsed),
  );
}
export function hashBrandIdentitySnapshotV1(
  snapshot: Omit<BrandIdentitySnapshotV1, 'contentHash'>,
): string {
  const {
    schemaVersion,
    organizationId,
    brandId,
    revisionId,
    revisionVersion,
    approval,
    identity,
    voice,
    generationRules,
  } = snapshot;
  return hashBrandedGenerationJsonV1(
    'brand-identity-v1',
    projection({
      schemaVersion,
      organizationId,
      brandId,
      revisionId,
      revisionVersion,
      approval,
      identity,
      voice,
      generationRules,
    }),
  );
}
export function hashBrandedGenerationRequestV1(
  input: BrandedGenerationInputV1,
): string {
  const parsed = brandedGenerationInputV1Schema.parse(input);
  const {
    requestKey: _requestKey,
    candidateIndex: _candidateIndex,
    parentRequestId: _parentRequestId,
    runId: _runId,
    workflowExecutionId: _workflowExecutionId,
    generationId: _generationId,
    originalPrompt,
    ...rest
  } = parsed;
  return hashBrandedGenerationJsonV1(
    'generation-request-v1',
    projection({
      ...rest,
      knowledgeSourceIds: [...rest.knowledgeSourceIds].sort(),
      knowledgeSpaceIds: [...rest.knowledgeSpaceIds].sort(),
      originalPromptHash: hashBrandedGenerationTextV1(originalPrompt),
    }),
  );
}
export function hashBrandedGenerationResolutionV1(
  resolution: BrandedGenerationResolutionV1,
): string {
  const parsed = brandedGenerationResolutionV1Schema.parse(resolution);
  const { revalidatedAt: _privateClock, ...application } =
    parsed.learning.privateAccount.application ?? {};
  const { revalidatedAt: _globalClock, ...global } = parsed.learning.global;
  const learning = {
    ...parsed.learning,
    global,
    privateAccount: { ...parsed.learning.privateAccount, application },
  };
  const common = {
    schemaVersion: parsed.schemaVersion,
    status: parsed.status,
    mode: parsed.mode,
    snapshotHash: parsed.snapshot?.contentHash ?? null,
    layers: parsed.layers,
    learning,
  };
  return hashBrandedGenerationJsonV1(
    'generation-resolution-v1',
    projection(
      parsed.status === 'resolved'
        ? {
            ...common,
            compiledPromptHash: hashBrandedGenerationTextV1(
              parsed.compiledPrompt,
            ),
            originalPromptHash: parsed.originalPromptHash,
          }
        : { ...common, reasonCode: parsed.reasonCode },
    ),
  );
}
export function hashBrandedGenerationArtifactManifestV1(
  input: BrandGenerationArtifactManifestInputV1,
): string {
  const mediaKind = brandGenerationArtifactV1Schema.shape.mediaKind.parse(
    input.mediaKind,
  );
  if (
    input.textHash !== null &&
    (typeof input.textHash !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/.test(input.textHash))
  )
    invalid();
  if (mediaKind === 'text' && input.textHash === null) invalid();
  if (!Array.isArray(input.parts) || input.parts.length > 256) invalid();
  const parts = input.parts.map((part) =>
    brandGenerationArtifactPartV1Schema.parse(part),
  );
  if (new Set(parts.map((part) => part.id)).size !== parts.length) invalid();
  return hashBrandedGenerationJsonV1(
    'generation-artifact-v1',
    projection({ mediaKind, textHash: input.textHash, parts }),
  );
}
export function hashBrandArtifactValidationReportV1(
  report: BrandArtifactValidationReportV1,
): string {
  const parsed = brandArtifactValidationReportV1Schema.parse(report);
  const {
    schemaVersion,
    rubricVersion,
    snapshotHash,
    artifactHash,
    artifactId,
    artifactVersion,
    checks,
    quality,
  } = parsed;
  const diagnostics = parsed.diagnostics.map(
    ({ message: _message, ...diagnostic }) => diagnostic,
  );
  return hashBrandedGenerationJsonV1(
    'brand-validation-report-v1',
    projection({
      schemaVersion,
      rubricVersion,
      snapshotHash,
      artifactHash,
      artifactId,
      artifactVersion,
      checks,
      quality,
      diagnostics,
    }),
  );
}
export function hashBrandedGenerationOperationV1(
  kind: BrandedGenerationOperationKindV1,
  body: BrandedGenerationJsonV1,
): string {
  if (!operations.includes(kind)) invalid();
  if (
    body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    (Object.hasOwn(body, 'expectedRevision') ||
      Object.hasOwn(body, 'operationKey'))
  )
    invalid();
  return hashBrandedGenerationJsonV1('receipt-operation-v1', { kind, body });
}

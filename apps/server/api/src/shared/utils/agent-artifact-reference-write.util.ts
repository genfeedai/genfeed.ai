import type {
  AgentArtifactRecordKind,
  AgentArtifactReference,
  AgentArtifactReferenceReadContext,
} from '@genfeedai/interfaces';
import {
  AGENT_ARTIFACT_RECORD_KINDS,
  AGENT_ARTIFACT_SERIALIZER_BY_KIND,
} from '@genfeedai/interfaces';
import type { AgentArtifactReferenceService } from '@genfeedai/server';
import { BadRequestException } from '@nestjs/common';

const MAX_AGENT_ARTIFACT_REFERENCES_PER_WRITE = 100;
const AGENT_ARTIFACT_RECORD_KIND_SET = new Set<string>(
  AGENT_ARTIFACT_RECORD_KINDS,
);

type ArtifactReferenceAuthorizer = Pick<
  AgentArtifactReferenceService,
  'resolveReference' | 'resolveVersionPin'
>;

export interface AgentArtifactWriteInput {
  artifactReferences?: unknown;
  artifactVersionPinIds?: unknown;
  metadata?: unknown;
}

export interface AuthorizedAgentArtifactWrite {
  artifactReferences: AgentArtifactReference[];
  artifactVersionPinIds: string[];
}

export interface AuthorizeAgentArtifactWriteParams {
  authorizer: ArtifactReferenceAuthorizer;
  inputs: AgentArtifactWriteInput[];
  readContext: AgentArtifactReferenceReadContext;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// `Object.hasOwn` reports true for a key that is explicitly set to `undefined`,
// which every server-side DTO built by object spread produces for an omitted
// optional field (`artifactReferences: request.artifactReferences`). Treating
// that as "supplied" made a plain text turn fail the array guard below with
// `artifactReferences must be an array`. Nullish means not supplied.
function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return (
    Object.hasOwn(record, key) &&
    record[key] !== undefined &&
    record[key] !== null
  );
}

function readArrayField(
  record: Record<string, unknown>,
  key: 'artifactReferences' | 'artifactVersionPinIds',
): unknown[] {
  if (!hasOwn(record, key)) {
    return [];
  }

  const value = record[key];
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${key} must be an array.`);
  }
  return value;
}

function collectField(
  inputs: AgentArtifactWriteInput[],
  key: 'artifactReferences' | 'artifactVersionPinIds',
): unknown[] {
  return inputs.flatMap((input) => {
    const topLevel = readArrayField(readRecord(input), key);
    const metadata = readArrayField(readRecord(input.metadata), key);
    return [...topLevel, ...metadata];
  });
}

function assertBounded(values: unknown[], label: string): void {
  if (values.length > MAX_AGENT_ARTIFACT_REFERENCES_PER_WRITE) {
    throw new BadRequestException(
      `${label} cannot contain more than ${MAX_AGENT_ARTIFACT_REFERENCES_PER_WRITE} entries.`,
    );
  }
}

function readReferenceIdentity(value: unknown): {
  brandId?: string;
  kind: AgentArtifactRecordKind;
  recordId: string;
} {
  const candidate = readRecord(value);
  const kind = candidate.kind;
  const recordId = candidate.recordId;
  const brandId = candidate.brandId;

  if (
    typeof kind !== 'string' ||
    !AGENT_ARTIFACT_RECORD_KIND_SET.has(kind) ||
    typeof recordId !== 'string' ||
    recordId.trim().length === 0 ||
    (brandId !== undefined &&
      (typeof brandId !== 'string' || brandId.trim().length === 0))
  ) {
    throw new BadRequestException(
      'Each artifact reference requires a supported kind and non-empty recordId; brandId must be a non-empty string when provided.',
    );
  }

  return {
    ...(typeof brandId === 'string' ? { brandId } : {}),
    kind: kind as AgentArtifactRecordKind,
    recordId: recordId.trim(),
  };
}

function rebuildReference(
  value: unknown,
  readContext: AgentArtifactReferenceReadContext,
): AgentArtifactReference {
  const identity = readReferenceIdentity(value);
  const brandId = readContext.brandId ?? identity.brandId;

  return {
    ...(brandId ? { brandId } : {}),
    kind: identity.kind,
    organizationId: readContext.organizationId,
    recordId: identity.recordId,
    serializer: AGENT_ARTIFACT_SERIALIZER_BY_KIND[identity.kind],
  } as AgentArtifactReference;
}

function readPinIds(values: unknown[]): string[] {
  const pinIds = values.map((value) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(
        'Each artifact version pin id must be a non-empty string.',
      );
    }
    return value.trim();
  });

  return [...new Set(pinIds)];
}

function dedupeReferences(
  references: AgentArtifactReference[],
): AgentArtifactReference[] {
  const unique = new Map<string, AgentArtifactReference>();
  for (const reference of references) {
    unique.set(`${reference.kind}:${reference.recordId}`, reference);
  }
  return [...unique.values()];
}

export function hasAgentArtifactWriteInput(
  ...inputs: AgentArtifactWriteInput[]
): boolean {
  return inputs.some((input) => {
    const topLevel = readRecord(input);
    const metadata = readRecord(input.metadata);
    return (
      hasOwn(topLevel, 'artifactReferences') ||
      hasOwn(topLevel, 'artifactVersionPinIds') ||
      hasOwn(metadata, 'artifactReferences') ||
      hasOwn(metadata, 'artifactVersionPinIds')
    );
  });
}

/**
 * Converts write-time reference input into server-owned identities. Caller
 * supplied organization, serializer, and scope fields are never persisted as
 * authority: they are rebuilt from authenticated context and checked against
 * the canonical record or immutable pin before the write proceeds.
 */
export async function authorizeAgentArtifactWrite(
  params: AuthorizeAgentArtifactWriteParams,
): Promise<AuthorizedAgentArtifactWrite> {
  const referenceValues = collectField(params.inputs, 'artifactReferences');
  const pinValues = collectField(params.inputs, 'artifactVersionPinIds');
  const references = dedupeReferences(
    referenceValues.map((value) => rebuildReference(value, params.readContext)),
  );
  const pinIds = readPinIds(pinValues);
  assertBounded(references, 'artifactReferences');
  assertBounded(pinIds, 'artifactVersionPinIds');
  const [resolvedReferences, resolvedPins] = await Promise.all([
    Promise.all(
      references.map((reference) =>
        params.authorizer.resolveReference(reference, params.readContext),
      ),
    ),
    Promise.all(
      pinIds.map((pinId) =>
        params.authorizer.resolveVersionPin({
          pinId,
          readContext: params.readContext,
        }),
      ),
    ),
  ]);

  const artifactReferences = dedupeReferences([
    ...resolvedReferences.map((resolved) => resolved.reference),
    ...resolvedPins.map((resolved) => resolved.reference),
  ]);
  assertBounded(artifactReferences, 'artifactReferences');

  return {
    artifactReferences,
    artifactVersionPinIds: pinIds,
  };
}

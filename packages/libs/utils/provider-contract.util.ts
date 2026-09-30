import { createHash } from 'node:crypto';

export interface ReplicateProviderContractHashInput {
  endpoint: string;
  inputSchema: unknown;
  openapi: unknown;
  outputSchema: unknown;
  pricing: unknown;
  providerVersion: string | null;
  schemaFamily: string | null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/** Canonical snapshot identity, shared by discovery and admission. */
export function hashProviderContract(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
}

/** Keep the discovery preimage and immutable-version proof byte-identical. */
export function hashReplicateProviderContract(
  input: ReplicateProviderContractHashInput,
): string {
  return hashProviderContract({
    endpoint: input.endpoint,
    inputSchema: input.inputSchema,
    openapi: input.openapi,
    outputSchema: input.outputSchema,
    pricing: input.pricing,
    providerVersion: input.providerVersion,
    schemaFamily: input.schemaFamily,
  });
}

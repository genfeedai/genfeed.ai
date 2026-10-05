import { sha256Hex, stableStringify } from './canonical-hash.util';

export interface ReplicateProviderContractHashInput {
  endpoint: string;
  inputSchema: unknown;
  openapi: unknown;
  outputSchema: unknown;
  pricing: unknown;
  providerVersion: string | null;
  schemaFamily: string | null;
}

/** Canonical snapshot identity, shared by discovery and admission. */
export function hashProviderContract(value: unknown): string {
  return `sha256:${sha256Hex(stableStringify(value))}`;
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

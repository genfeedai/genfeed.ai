/**
 * Media readiness diagnostics are value objects, not rows: they are computed
 * per publish attempt and never persisted on their own. The serializer still
 * needs a stable `id`, so derive one from the fields that identify the
 * violation — the same asset breaking the same rule on the same platform
 * serializes to the same id across attempts.
 */

export interface MediaReadinessDiagnosticInput {
  actual: string;
  assetId: string;
  code: string;
  kind: string;
  limit: string;
  message: string;
  platform: string;
  property: string;
  severity: string;
}

export interface MediaReadinessDiagnosticRecord
  extends MediaReadinessDiagnosticInput {
  id: string;
}

export function toMediaReadinessDiagnosticRecord(
  diagnostic: MediaReadinessDiagnosticInput,
): MediaReadinessDiagnosticRecord {
  return {
    ...diagnostic,
    id: `${diagnostic.assetId}:${diagnostic.platform}:${diagnostic.property}:${diagnostic.code}`,
  };
}

export function toMediaReadinessDiagnosticRecords(
  diagnostics: readonly MediaReadinessDiagnosticInput[],
): MediaReadinessDiagnosticRecord[] {
  return diagnostics.map(toMediaReadinessDiagnosticRecord);
}

/** Reviewed provider input. This contract never contains credentials or pricing. */
export type CrunInputValue = string | number | boolean | string[];

export interface CrunInputField {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array';
  isRequired: boolean;
  default?: CrunInputValue;
  enum?: readonly CrunInputValue[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  format?: 'uri';
}

export interface CrunModelInputContract {
  version: string;
  endpoint: string;
  mediaKind: 'image';
  fields: Record<string, CrunInputField>;
  referenceRoles: Record<string, 'image'>;
  serverOverrides: Record<string, CrunInputValue>;
  isAutoAspectReferenceRequired: boolean;
}

/** Allowlisted creator projection; server-only launch overrides are excluded. */
export interface CrunInputControls {
  version: string;
  endpoint: string;
  mediaKind: 'image';
  fields: Record<string, CrunInputField>;
  referenceRoles: Record<string, 'image'>;
  isAutoAspectReferenceRequired: boolean;
  maxOutputs: 4;
  isBatchSupported: false;
}

export interface CrunInputFieldError {
  field: string;
  code:
    | 'required'
    | 'unknown'
    | 'type'
    | 'enum'
    | 'bounds'
    | 'uri'
    | 'reference_required';
}

export type CrunNormalizedInput =
  | { isValid: true; input: Record<string, CrunInputValue> }
  | { isValid: false; errors: CrunInputFieldError[] };

export const CRUN_TASK_STATES = [
  'prepared',
  'submitting',
  'pending',
  'running',
  'provider-success',
  'provider-failed',
  'recovery-required',
  'finalized',
] as const;

export type CrunTaskState = (typeof CRUN_TASK_STATES)[number];

export function parseCrunTaskState(value: unknown): CrunTaskState | null {
  return typeof value === 'string'
    ? (CRUN_TASK_STATES.find((state) => state === value) ?? null)
    : null;
}

import { OrganizationSetting as BaseOrganizationSetting } from '@genfeedai/client/models';
import type { IOrganizationSetting } from '@genfeedai/interfaces';

const OBJECT_ID_BYTE_LENGTH = 12;
const OBJECT_ID_HEX_LENGTH = 24;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidObjectIdHex(value: string): boolean {
  return value.length === OBJECT_ID_HEX_LENGTH && /^[a-fA-F0-9]+$/.test(value);
}

function bytesToHex(bytes: number[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeBufferLike(value: unknown): string | null {
  if (value instanceof Uint8Array) {
    return value.length === OBJECT_ID_BYTE_LENGTH
      ? bytesToHex(Array.from(value))
      : null;
  }

  if (Array.isArray(value)) {
    const normalizedBytes = value.filter(
      (item): item is number =>
        typeof item === 'number' && Number.isInteger(item) && item >= 0,
    );

    return normalizedBytes.length === OBJECT_ID_BYTE_LENGTH
      ? bytesToHex(normalizedBytes)
      : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (
    value.type === 'Buffer' &&
    Array.isArray(value.data) &&
    value.data.every(
      (item) => typeof item === 'number' && Number.isInteger(item) && item >= 0,
    )
  ) {
    return value.data.length === OBJECT_ID_BYTE_LENGTH
      ? bytesToHex(value.data)
      : null;
  }

  const orderedBytes = Object.entries(value)
    .filter(
      (entry): entry is [string, number] =>
        /^\d+$/.test(entry[0]) && typeof entry[1] === 'number',
    )
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([, byte]) => byte);

  return orderedBytes.length === OBJECT_ID_BYTE_LENGTH
    ? bytesToHex(orderedBytes)
    : null;
}

function normalizeEnabledModelId(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const objectIdValue = value.$oid;
  if (typeof objectIdValue === 'string' && isValidObjectIdHex(objectIdValue)) {
    return objectIdValue;
  }

  const toHexString = value.toHexString;
  if (typeof toHexString === 'function') {
    const normalized = toHexString.call(value);
    if (typeof normalized === 'string' && isValidObjectIdHex(normalized)) {
      return normalized;
    }
  }

  return normalizeBufferLike(value.buffer);
}

function normalizeEnabledModels(
  enabledModels: IOrganizationSetting['enabledModels'] | unknown,
): string[] | undefined {
  if (!Array.isArray(enabledModels)) {
    return undefined;
  }

  const normalized = enabledModels
    .map((model) => normalizeEnabledModelId(model))
    .filter((model): model is string => Boolean(model));

  return [...new Set(normalized)];
}

export function normalizeOrganizationSetting(
  partial: Partial<IOrganizationSetting> = {},
): Partial<IOrganizationSetting> {
  const normalizedEnabledModels = normalizeEnabledModels(partial.enabledModels);

  if (normalizedEnabledModels === undefined) {
    return partial;
  }

  return {
    ...partial,
    enabledModels:
      normalizedEnabledModels as IOrganizationSetting['enabledModels'],
  };
}

export class OrganizationSetting extends BaseOrganizationSetting {
  constructor(partial: Partial<IOrganizationSetting> = {}) {
    super(normalizeOrganizationSetting(partial));
  }
}

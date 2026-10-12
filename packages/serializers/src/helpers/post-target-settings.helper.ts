import {
  type ChannelSettingDefinition,
  getChannelCapability,
} from '@genfeedai/contracts/api-types/contracts';

function isPublicSettingValue(
  definition: ChannelSettingDefinition,
  value: unknown,
): boolean {
  switch (definition.type) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'multi_select':
      return (
        Array.isArray(value) &&
        value.every(
          (item) =>
            typeof item === 'string' &&
            (!definition.options ||
              definition.options.some((option) => option.value === item)),
        )
      );
    default:
      return (
        typeof value === 'string' &&
        (!definition.options ||
          definition.options.some((option) => option.value === value))
      );
  }
}

export function serializePostTargetSettings(
  record: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const settings = record.targetSettings;
  if (
    typeof record.platform !== 'string' ||
    !settings ||
    typeof settings !== 'object' ||
    Array.isArray(settings)
  )
    return undefined;
  const definitions = getChannelCapability(record.platform)?.settings ?? [];
  const values = settings as Record<string, unknown>;
  const result = Object.fromEntries(
    definitions
      .filter((definition) =>
        isPublicSettingValue(definition, values[definition.key]),
      )
      .map((definition) => [definition.key, values[definition.key]]),
  );
  return Object.keys(result).length ? result : undefined;
}

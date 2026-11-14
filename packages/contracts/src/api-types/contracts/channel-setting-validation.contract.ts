/**
 * Per-setting value checks for channel target settings: declared type, `url`
 * shape and allowed options. Split from the capability catalog so that file
 * holds the catalog and its lookups.
 */

import { z } from 'zod';

export const channelSettingFieldTypeValues = [
  'string',
  'text',
  'number',
  'boolean',
  'select',
  'multi_select',
  'url',
] as const;

export const channelValidationSeverityValues = ['error', 'warning'] as const;

export const channelSettingFieldTypeSchema = z.enum(
  channelSettingFieldTypeValues,
);
export const channelValidationSeveritySchema = z.enum(
  channelValidationSeverityValues,
);
const settingDefaultValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export const channelSettingOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

export const channelSettingDefinitionSchema = z.object({
  defaultValue: settingDefaultValueSchema.optional(),
  description: z.string().min(1).optional(),
  helper: z.string().min(1).optional(),
  key: z.string().min(1),
  label: z.string().min(1),
  options: z.array(channelSettingOptionSchema).optional(),
  required: z.boolean().optional(),
  type: channelSettingFieldTypeSchema,
});

export const channelValidationIssueSchema = z.object({
  code: z.string().min(1),
  field: z.string().min(1).optional(),
  message: z.string().min(1),
  severity: channelValidationSeveritySchema,
});

export type ChannelSettingFieldType = z.infer<
  typeof channelSettingFieldTypeSchema
>;
export type ChannelSettingDefinition = z.infer<
  typeof channelSettingDefinitionSchema
>;
export type ChannelValidationIssue = z.infer<
  typeof channelValidationIssueSchema
>;

export function validateSettingType(
  setting: ChannelSettingDefinition,
  value: unknown,
  label: string,
  field: string,
): ChannelValidationIssue[] {
  const typeMatches =
    (setting.type === 'boolean' && typeof value === 'boolean') ||
    (setting.type === 'number' && typeof value === 'number') ||
    (setting.type === 'multi_select' &&
      Array.isArray(value) &&
      value.every((item) => typeof item === 'string')) ||
    (setting.type !== 'boolean' &&
      setting.type !== 'number' &&
      setting.type !== 'multi_select' &&
      typeof value === 'string');

  if (typeMatches) {
    // `url` is otherwise indistinguishable from `string`, so without this the
    // declared type is decoration and an unparseable host reaches the publisher.
    if (setting.type === 'url' && !isParsableHttpUrl(value)) {
      return [
        {
          code: 'channel_target.invalid_setting_url',
          field,
          message: `${label} setting ${setting.label} must be an http(s) URL.`,
          severity: 'error',
        },
      ];
    }

    return [];
  }

  return [
    {
      code: 'channel_target.invalid_setting_type',
      field,
      message: `${label} setting ${setting.label} must be a valid ${setting.type} value.`,
      severity: 'error',
    },
  ];
}

// Matched rather than parsed with `URL`: this contract compiles without DOM or
// Node lib types so it can run in the browser bundle, workers, and the CLI.
//
// The authority run and the remainder must not overlap. `[^\s/?#]+[^\s]*` lets
// both halves consume the same non-delimiter characters, so a long failing
// input is re-split at every position — quadratic backtracking on a value that
// reaches this from request data. Requiring the remainder to start with one of
// `/?#` makes the split deterministic without changing what is accepted.
const HTTP_URL_PATTERN = /^https?:\/\/[^\s/?#]+(?:[/?#]\S*)?$/i;

function isParsableHttpUrl(value: unknown): boolean {
  return typeof value === 'string' && HTTP_URL_PATTERN.test(value.trim());
}

export function validateSettingOptions(
  setting: ChannelSettingDefinition,
  value: unknown,
  label: string,
  field: string,
): ChannelValidationIssue[] {
  if (!setting.options || setting.options.length === 0) {
    return [];
  }

  const allowedValues = new Set(setting.options.map((option) => option.value));
  const submittedValues = Array.isArray(value) ? value : [value];

  for (const submittedValue of submittedValues) {
    if (
      typeof submittedValue !== 'string' ||
      !allowedValues.has(submittedValue)
    ) {
      return [
        {
          code: 'channel_target.invalid_setting_option',
          field,
          message: `${label} setting ${setting.label} must use one of: ${[
            ...allowedValues,
          ].join(', ')}.`,
          severity: 'error',
        },
      ];
    }
  }

  return [];
}

export function isMissingValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  );
}

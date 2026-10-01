import type {
  CrunInputControls,
  CrunInputField,
  CrunInputFieldError,
  CrunInputValue,
  CrunModelInputContract,
  CrunNormalizedInput,
} from '@genfeedai/contracts/interfaces';

function validateField(
  field: CrunInputField,
  value: unknown,
): CrunInputFieldError['code'] | null {
  if (field.type === 'array') {
    if (
      !Array.isArray(value) ||
      !value.every((item) => typeof item === 'string')
    )
      return 'type';
    if (
      (field.minItems !== undefined && value.length < field.minItems) ||
      (field.maxItems !== undefined && value.length > field.maxItems)
    )
      return 'bounds';
    if (field.format === 'uri' && value.some((item) => !isHttpsUrl(item)))
      return 'uri';
  } else if (field.type === 'number' || field.type === 'integer') {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (field.type === 'integer' && !Number.isInteger(value))
    )
      return 'type';
    if (
      (field.minimum !== undefined && value < field.minimum) ||
      (field.maximum !== undefined && value > field.maximum)
    )
      return 'bounds';
  } else if (field.type === 'string') {
    if (typeof value !== 'string') return 'type';
    if (
      (field.minLength !== undefined && value.length < field.minLength) ||
      (field.maxLength !== undefined && value.length > field.maxLength)
    )
      return 'bounds';
    if (field.format === 'uri' && !isHttpsUrl(value)) return 'uri';
  } else if (typeof value !== 'boolean') return 'type';
  if (field.enum && !field.enum.some((option) => option === value))
    return 'enum';
  return null;
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** The client validates asset IDs; the server validates resolved HTTPS media URLs. */
export function normalizeCrunInput(
  contract: CrunModelInputContract | CrunInputControls,
  values: Record<string, unknown>,
): CrunNormalizedInput {
  if (contract.mediaKind === 'video') {
    const rules = contract.videoRules;
    const kling = contract.endpoint === 'kling/v2-5-turbo-pro';
    const veo = contract.endpoint === 'google/veo3-1-fast-t2v';
    const durations = kling ? [5, 10] : [8];
    if (
      (!kling && !veo) ||
      !rules ||
      rules.referenceMode !== (kling ? 'start-end' : 'none') ||
      rules.omitAspectRatioWithReferences !== kling ||
      !Array.isArray(rules.availableDurations) ||
      rules.availableDurations.length !== durations.length ||
      !durations.every(
        (duration, index) => rules.availableDurations[index] === duration,
      )
    )
      return {
        isValid: false,
        errors: [{ field: 'videoRules', code: 'contract_mismatch' }],
      };
  }
  const isTextOnlyVideo =
    contract.mediaKind === 'video' &&
    contract.endpoint === 'google/veo3-1-fast-t2v';
  const errors: CrunInputFieldError[] = [];
  const input: Record<string, CrunInputValue> = {};
  for (const name of Object.keys(values)) {
    if (
      !Object.hasOwn(contract.fields, name) ||
      (isTextOnlyVideo && name === 'img_urls')
    )
      errors.push({ field: name, code: 'unknown' });
  }
  for (const [name, field] of Object.entries(contract.fields)) {
    if (isTextOnlyVideo && name === 'img_urls') {
      if (!Object.hasOwn(values, name) && field.default !== undefined)
        errors.push({ field: name, code: 'unknown' });
      continue;
    }
    const value = Object.hasOwn(values, name) ? values[name] : field.default;
    if (value === undefined) {
      if (field.isRequired) errors.push({ field: name, code: 'required' });
      continue;
    }
    // Optional empty references are omitted, never forwarded as an invalid array.
    if (
      field.type === 'array' &&
      Array.isArray(value) &&
      value.length === 0 &&
      !field.isRequired
    )
      continue;
    const code = validateField(field, value);
    if (code) errors.push({ field: name, code });
    else input[name] = value as CrunInputValue;
  }
  if (
    contract.isAutoAspectReferenceRequired &&
    input.aspect_ratio === 'auto' &&
    !Object.keys(contract.referenceRoles).some(
      (name) => Array.isArray(input[name]) && input[name].length > 0,
    )
  ) {
    errors.push({ field: 'aspect_ratio', code: 'reference_required' });
  }
  if (contract.mediaKind === 'video') {
    if (
      typeof input.duration === 'number' &&
      !contract.videoRules?.availableDurations.includes(input.duration)
    )
      errors.push({ field: 'duration', code: 'pricing_unavailable' });
    if (
      contract.videoRules?.omitAspectRatioWithReferences &&
      Array.isArray(input.img_urls) &&
      input.img_urls.length
    )
      delete input.aspect_ratio;
  }
  if (errors.length) return { isValid: false, errors };
  if ('serverOverrides' in contract)
    Object.assign(input, contract.serverOverrides);
  return { isValid: true, input };
}

export function projectCrunInputControls(
  contract: CrunModelInputContract,
): CrunInputControls {
  return {
    endpoint: contract.endpoint,
    fields: Object.fromEntries(
      Object.entries(contract.fields)
        .filter(([key]) =>
          (contract.mediaKind === 'video'
            ? [
                'prompt',
                'img_urls',
                'duration',
                'aspect_ratio',
                'resolution',
                'negative_prompt',
                'cfg_scale',
                'translate_prompt',
              ]
            : [
                'prompt',
                'img_urls',
                'resolution',
                'aspect_ratio',
                'output_format',
              ]
          ).includes(key),
        )
        .map(([key, field]) => [
          key,
          {
            type: field.type,
            isRequired: field.isRequired,
            ...(field.default !== undefined
              ? {
                  default: Array.isArray(field.default)
                    ? [...field.default]
                    : field.default,
                }
              : {}),
            ...(field.enum !== undefined
              ? {
                  enum: field.enum.map((value) =>
                    Array.isArray(value) ? [...value] : value,
                  ),
                }
              : {}),
            ...(field.minimum !== undefined ? { minimum: field.minimum } : {}),
            ...(field.maximum !== undefined ? { maximum: field.maximum } : {}),
            ...(field.minLength !== undefined
              ? { minLength: field.minLength }
              : {}),
            ...(field.maxLength !== undefined
              ? { maxLength: field.maxLength }
              : {}),
            ...(field.minItems !== undefined
              ? { minItems: field.minItems }
              : {}),
            ...(field.maxItems !== undefined
              ? { maxItems: field.maxItems }
              : {}),
            ...(field.format !== undefined ? { format: field.format } : {}),
          },
        ]),
    ),
    isAutoAspectReferenceRequired: contract.isAutoAspectReferenceRequired,
    isBatchSupported: false,
    maxOutputs: 4,
    mediaKind: contract.mediaKind,
    referenceRoles:
      contract.mediaKind === 'video'
        ? { ...contract.referenceRoles }
        : { img_urls: 'image' },
    ...(contract.mediaKind === 'video' && contract.videoRules
      ? {
          videoRules: {
            ...contract.videoRules,
            availableDurations: [...contract.videoRules.availableDurations],
          },
        }
      : {}),
    version: contract.version,
  };
}

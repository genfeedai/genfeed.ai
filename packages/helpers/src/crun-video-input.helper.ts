import type {
  CrunInputControls,
  CrunInputFieldError,
  CrunNormalizedInput,
  CrunVideoDraft,
  CrunVideoReferenceMode,
} from '@genfeedai/contracts/interfaces';
import { normalizeCrunInput } from './crun-input-contract.helper';

function acceptsVideoContract(controls: CrunInputControls): boolean {
  if (controls.mediaKind !== 'video') return false;
  const result = normalizeCrunInput(controls, { prompt: 'x' });
  return (
    result.isValid ||
    !result.errors.some((error) => error.code === 'contract_mismatch')
  );
}

export function createCrunVideoDraft(
  controls: CrunInputControls,
  prompt: string,
): CrunVideoDraft | null {
  if (!acceptsVideoContract(controls)) return null;
  const draft: CrunVideoDraft = {
    modelKey: `crun/${controls.endpoint}`,
    contractVersion: controls.version,
    prompt: prompt.trim(),
  };
  const duration = controls.fields.duration?.default;
  const aspectRatio = controls.fields.aspect_ratio?.default;
  const resolution = controls.fields.resolution?.default;
  const guidanceScale = controls.fields.cfg_scale?.default;
  const translatePrompt = controls.fields.translate_prompt?.default;
  if (typeof duration === 'number') draft.duration = duration;
  if (typeof aspectRatio === 'string') draft.aspectRatio = aspectRatio;
  if (typeof resolution === 'string') draft.resolution = resolution;
  if (typeof guidanceScale === 'number') draft.guidanceScale = guidanceScale;
  if (typeof translatePrompt === 'boolean')
    draft.translatePrompt = translatePrompt;
  return draft;
}

/** ID mode validates local shape only. Its result must never be dispatched to a provider. */
export function normalizeCrunVideoDraft(
  controls: CrunInputControls,
  draft: CrunVideoDraft,
  referenceMode: CrunVideoReferenceMode = 'id',
): CrunNormalizedInput {
  const errors: CrunInputFieldError[] = [];
  if (!acceptsVideoContract(controls))
    return {
      isValid: false,
      errors: [{ field: 'videoRules', code: 'contract_mismatch' }],
    };
  if (draft.modelKey !== `crun/${controls.endpoint}`)
    errors.push({ field: 'modelKey', code: 'contract_mismatch' });
  if (draft.contractVersion !== controls.version)
    errors.push({ field: 'contractVersion', code: 'contract_mismatch' });
  const mapping = {
    prompt: 'prompt',
    duration: 'duration',
    aspectRatio: 'aspect_ratio',
    resolution: 'resolution',
    negativePrompt: 'negative_prompt',
    guidanceScale: 'cfg_scale',
    translatePrompt: 'translate_prompt',
  } as const;
  for (const key of Object.keys(draft)) {
    if (
      !Object.hasOwn(mapping, key) &&
      !['modelKey', 'contractVersion', 'startFrameId', 'endFrameId'].includes(
        key,
      )
    )
      errors.push({ field: key, code: 'unknown' });
  }
  const values: Record<string, unknown> = {};
  for (const [key, name] of Object.entries(mapping)) {
    const value = draft[key as keyof typeof mapping];
    if (value === undefined) continue;
    if (!Object.hasOwn(controls.fields, name)) {
      errors.push({ field: name, code: 'unknown' });
      continue;
    }
    if (key === 'negativePrompt' && typeof value === 'string' && !value.trim())
      continue;
    values[name] =
      typeof value === 'string' &&
      (key === 'prompt' || key === 'negativePrompt')
        ? value.trim()
        : value;
  }
  const start = draft.startFrameId;
  const end = draft.endFrameId;
  const frames = [start, end].filter(
    (value) => value !== undefined && value !== '',
  );
  if (frames.length && controls.videoRules?.referenceMode === 'none') {
    for (const key of ['startFrameId', 'endFrameId'] as const)
      if (draft[key] !== undefined && draft[key] !== '')
        errors.push({ field: key, code: 'unknown' });
  } else {
    if (end && !start)
      errors.push({ field: 'endFrameId', code: 'reference_required' });
    if (start && end && start === end)
      errors.push({ field: 'endFrameId', code: 'bounds' });
    if (referenceMode === 'id') {
      for (const key of ['startFrameId', 'endFrameId'] as const) {
        const value = draft[key];
        if (value === undefined || value === '') continue;
        const code =
          typeof value !== 'string'
            ? 'type'
            : value.length > 256
              ? 'bounds'
              : /[\s:/?#\\]/.test(value)
                ? 'uri'
                : null;
        if (code) errors.push({ field: key, code });
      }
    }
    if (frames.length) values.img_urls = frames;
  }
  const field = controls.fields.img_urls;
  const contract =
    referenceMode === 'id' && field
      ? {
          ...controls,
          fields: {
            ...controls.fields,
            img_urls: { ...field, format: undefined },
          },
        }
      : controls;
  const result = normalizeCrunInput(contract, values);
  if (!result.isValid) errors.push(...result.errors);
  return errors.length ? { isValid: false, errors } : result;
}

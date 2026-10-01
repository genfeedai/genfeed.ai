'use client';

import type { IModel } from '@genfeedai/contracts/interfaces';
import type { CrunInputControls } from '@genfeedai/contracts/interfaces/content/crun-contract.interface';
import type { StudioGenerateSettings } from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';
import { useEffect, useMemo } from 'react';

export function crunFieldOptions(
  controls: CrunInputControls | undefined,
  field: string,
): string[] {
  return (
    controls?.fields[field]?.enum?.filter(
      (value): value is string => typeof value === 'string',
    ) ?? []
  );
}

export function normalizeCrunSettings(
  settings: StudioGenerateSettings,
  controls: CrunInputControls | undefined,
  referenceCount: number,
): Partial<StudioGenerateSettings> {
  if (!controls)
    return settings.crunControls ? { crunControls: undefined } : {};
  const ratios = crunFieldOptions(controls, 'aspect_ratio').filter(
    (ratio) =>
      ratio !== 'auto' ||
      referenceCount > 0 ||
      !controls.isAutoAspectReferenceRequired,
  );
  const resolutions = crunFieldOptions(controls, 'resolution');
  const formats = crunFieldOptions(controls, 'output_format');
  const identityChanged =
    settings.crunControls?.modelKey !== settings.modelKey ||
    settings.crunControls?.contractVersion !== controls.version;
  const outputFormat = formats.includes(
    settings.crunControls?.outputFormat ?? '',
  )
    ? settings.crunControls?.outputFormat
    : typeof controls.fields.output_format?.default === 'string'
      ? controls.fields.output_format.default
      : undefined;
  const patch: Partial<StudioGenerateSettings> = {};
  if (!ratios.includes(settings.aspectRatio))
    patch.aspectRatio = String(
      controls.fields.aspect_ratio?.default ?? ratios[0],
    );
  if (!resolutions.includes(settings.resolution))
    patch.resolution = String(
      controls.fields.resolution?.default ?? resolutions[0],
    );
  if (
    !Number.isInteger(settings.outputs) ||
    settings.outputs < 1 ||
    settings.outputs > controls.maxOutputs
  )
    patch.outputs = Math.min(
      controls.maxOutputs,
      Math.max(1, Math.floor(settings.outputs) || 1),
    );
  if (
    identityChanged ||
    outputFormat !== settings.crunControls?.outputFormat ||
    (settings.crunControls?.aspectRatio !== undefined &&
      settings.crunControls.aspectRatio !== settings.aspectRatio)
  )
    patch.crunControls = {
      modelKey: settings.modelKey,
      contractVersion: controls.version,
      ...(outputFormat ? { outputFormat } : {}),
    };
  return patch;
}

export function useCrunInputControls(
  models: readonly IModel[],
  settings: StudioGenerateSettings,
  referenceCount: number,
  onChange: (patch: Partial<StudioGenerateSettings>) => void,
) {
  const controls = models.find(
    (model) => model.key === settings.modelKey && model.provider === 'crun',
  )?.inputControls;
  const patch = useMemo(
    () => normalizeCrunSettings(settings, controls, referenceCount),
    [settings, controls, referenceCount],
  );
  useEffect(() => {
    if (Object.keys(patch).length) onChange(patch);
  }, [patch, onChange]);
  return controls;
}

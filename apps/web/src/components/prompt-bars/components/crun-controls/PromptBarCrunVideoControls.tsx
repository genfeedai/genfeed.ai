'use client';

import type {
  CrunInputFieldError,
  CrunVideoDraft,
} from '@genfeedai/contracts/interfaces';
import {
  createCrunVideoDraft,
  normalizeCrunVideoDraft,
} from '@genfeedai/helpers/crun-video-input.helper';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { Textarea } from '@ui/primitives/textarea';
import PromptBarCompactSelect from '@ui/prompt-bars/components/toolbar/PromptBarCompactSelect';
import { Fragment, useId, useState } from 'react';
import type { CrunVideoControlsProps } from '@/props/studio/crun-video-controls.props';

export default function PromptBarCrunVideoControls({
  controls,
  value,
  onChange,
  isDisabled = false,
  errors = [],
  labels,
}: CrunVideoControlsProps) {
  const id = useId();
  const [editErrors, setEditErrors] = useState<
    [CrunVideoDraft, readonly CrunInputFieldError[]] | null
  >(null);
  const draft = createCrunVideoDraft(controls, value.prompt);
  if (
    !draft ||
    draft.modelKey !== value.modelKey ||
    draft.contractVersion !== value.contractVersion
  )
    return <Label role="alert">{labels.invalidContract}</Label>;
  const current = normalizeCrunVideoDraft(controls, value);
  const allErrors = [
    ...errors,
    ...(editErrors?.[0] === value ? editErrors[1] : []),
    ...(current.isValid ? [] : current.errors),
  ];
  function change(patch: Partial<CrunVideoDraft>) {
    if (isDisabled) return;
    const result = normalizeCrunVideoDraft(controls, { ...value, ...patch });
    setEditErrors([value, result.isValid ? [] : result.errors]);
    onChange(patch);
  }
  function accessibility(name: string) {
    const error = allErrors.find((item) => item.field === name);
    return {
      id: `${id}-${name}`,
      'aria-invalid': !!error,
      'aria-describedby': error ? `${id}-${name}-error` : undefined,
    };
  }
  function errorMessage(name: string) {
    const error = allErrors.find((item) => item.field === name);
    return error ? (
      <Label id={`${id}-${name}-error`} role="alert">
        {labels.errorMessages[error.code]}
      </Label>
    ) : null;
  }
  const selects = [
    ['duration', 'duration', labels.duration, 'duration'],
    ['aspect_ratio', 'aspectRatio', labels.aspectRatio, 'aspectRatio'],
    ['resolution', 'resolution', labels.resolution, 'format'],
  ] as const;
  const hasFrames =
    controls.videoRules?.omitAspectRatioWithReferences && !!value.startFrameId;
  return (
    <>
      {selects.map(([name, key, label, icon]) => {
        const field = controls.fields[name];
        if (!field?.enum || (name === 'aspect_ratio' && hasFrames)) return null;
        const accessible = accessibility(name);
        return (
          <Fragment key={name}>
            <PromptBarCompactSelect
              ariaLabel={label}
              describedBy={accessible['aria-describedby']}
              icon={icon}
              id={accessible.id}
              isDisabled={isDisabled}
              isInvalid={accessible['aria-invalid']}
              onChange={(selected) => {
                const option = field.enum?.find(
                  (item) => String(item) === selected,
                );
                if (name === 'duration') {
                  if (
                    typeof option === 'number' &&
                    controls.videoRules?.availableDurations.includes(option)
                  )
                    change({ duration: option });
                } else if (typeof option === 'string')
                  change({ [key]: option });
              }}
              options={field.enum.flatMap((option) => {
                if (typeof option !== 'number' && typeof option !== 'string')
                  return [];
                const unavailable =
                  name === 'duration' &&
                  typeof option === 'number' &&
                  !controls.videoRules?.availableDurations.includes(option);
                return [
                  {
                    isDisabled: unavailable,
                    label: `${String(option)}${name === 'duration' ? 's' : ''}${
                      unavailable ? ` — ${labels.pricingReviewRequired}` : ''
                    }`,
                    value: String(option),
                  },
                ];
              })}
              value={String(value[key] ?? field.default ?? '')}
            />
            {errorMessage(name)}
          </Fragment>
        );
      })}
      {hasFrames && <Label>{labels.aspectFromFrames}</Label>}
      {controls.fields.negative_prompt && (
        <>
          <Label htmlFor={`${id}-negative_prompt`}>
            {labels.negativePrompt}
          </Label>
          <Textarea
            {...accessibility('negative_prompt')}
            value={value.negativePrompt ?? ''}
            isDisabled={isDisabled}
            isRequired={controls.fields.negative_prompt.isRequired}
            maxLength={controls.fields.negative_prompt.maxLength}
            onChange={(event) => change({ negativePrompt: event.target.value })}
          />
          {errorMessage('negative_prompt')}
        </>
      )}
      {controls.fields.cfg_scale && (
        <>
          <Label htmlFor={`${id}-cfg_scale`}>{labels.guidanceScale}</Label>
          <Input
            {...accessibility('cfg_scale')}
            type="number"
            value={value.guidanceScale ?? ''}
            isDisabled={isDisabled}
            isRequired={controls.fields.cfg_scale.isRequired}
            min={controls.fields.cfg_scale.minimum}
            max={controls.fields.cfg_scale.maximum}
            step={0.01}
            onChange={(event) => {
              const next = event.target.valueAsNumber;
              if (event.target.value === '')
                change({ guidanceScale: undefined });
              else if (Number.isFinite(next)) change({ guidanceScale: next });
              else
                setEditErrors([value, [{ field: 'cfg_scale', code: 'type' }]]);
            }}
          />
          {errorMessage('cfg_scale')}
        </>
      )}
      {controls.fields.translate_prompt && (
        <>
          <Label htmlFor={`${id}-translate_prompt`}>
            {labels.translatePrompt}
          </Label>
          <Checkbox
            {...accessibility('translate_prompt')}
            isChecked={value.translatePrompt === true}
            isDisabled={isDisabled}
            isRequired={controls.fields.translate_prompt.isRequired}
            onCheckedChange={(checked) =>
              change({ translatePrompt: checked === true })
            }
          />
          {errorMessage('translate_prompt')}
        </>
      )}
    </>
  );
}

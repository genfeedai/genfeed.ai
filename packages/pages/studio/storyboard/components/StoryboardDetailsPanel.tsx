'use client';

import type { StoryboardDetailsPanelProps } from '@genfeedai/props/studio/storyboard.props';
import StoryboardSelect from '@pages/studio/storyboard/components/StoryboardSelect';
import { editStoryboardStyle } from '@pages/studio/storyboard/utils/storyboard-plan';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';

const AUTOMATIC_MODEL = '__automatic__';

/** Plan-level settings. Every field edits the plan and rides the same autosave. */
export default function StoryboardDetailsPanel({
  isDisabled,
  isTimingDisabled,
  modelCapabilities,
  onChange,
  onChangeModel,
  plan,
  sourceBrief,
  supportedFormats,
}: StoryboardDetailsPanelProps) {
  const translate = useTranslations('pages.studioStoryboard.plan');
  return (
    <div className="flex flex-col gap-4" data-testid="storyboard-details">
      <Field label={translate('titleField')}>
        <Input
          value={plan.title}
          maxLength={120}
          disabled={isDisabled}
          onChange={(event) => onChange({ ...plan, title: event.target.value })}
        />
      </Field>
      <Field label={translate('logline')}>
        <Textarea
          value={plan.logline}
          maxLength={300}
          disabled={isDisabled}
          onChange={(event) =>
            onChange({ ...plan, logline: event.target.value })
          }
        />
      </Field>
      <Field label={translate('style')}>
        <Input
          value={plan.styleLabel ?? ''}
          maxLength={60}
          disabled={isDisabled}
          onChange={(event) =>
            onChange(
              editStoryboardStyle(plan, { styleLabel: event.target.value }),
            )
          }
        />
      </Field>
      <Field label={translate('videoModel')}>
        <StoryboardSelect
          ariaLabel={translate('videoModel')}
          value={plan.videoModelKey ?? AUTOMATIC_MODEL}
          placeholder={translate('chooseVideoModel')}
          isDisabled={isDisabled || !modelCapabilities?.eligibleModels.length}
          options={[
            ...(modelCapabilities?.requestedModelKey === null &&
            modelCapabilities.effectiveModel
              ? [
                  {
                    value: AUTOMATIC_MODEL,
                    label: translate('automaticModel', {
                      label: modelCapabilities.effectiveModel.label,
                    }),
                  },
                ]
              : []),
            ...(modelCapabilities?.eligibleModels.map((candidate) => ({
              value: candidate.key,
              label: candidate.label,
            })) ?? []),
          ]}
          onChange={onChangeModel}
        />
      </Field>
      <Field label={translate('format')}>
        <StoryboardSelect
          ariaLabel={translate('format')}
          value={plan.format}
          placeholder={translate('chooseFormat')}
          isDisabled={isDisabled || isTimingDisabled}
          options={supportedFormats.map((value) => ({ value, label: value }))}
          onChange={(value) => {
            if (value === '9:16' || value === '16:9' || value === '1:1')
              onChange({ ...plan, format: value });
          }}
        />
      </Field>
      <Field label={translate('runtimeBudget')}>
        <Input
          type="number"
          min={1}
          max={60}
          value={plan.runtimeBudgetSeconds ?? ''}
          disabled={isDisabled || isTimingDisabled}
          onChange={(event) =>
            onChange({
              ...plan,
              runtimeBudgetSeconds: event.target.value
                ? Number(event.target.value)
                : null,
            })
          }
        />
      </Field>
      {sourceBrief ? (
        <Field label={translate('brief')} helpText={translate('briefHelp')}>
          <Textarea value={sourceBrief} isReadOnly />
        </Field>
      ) : null}
    </div>
  );
}

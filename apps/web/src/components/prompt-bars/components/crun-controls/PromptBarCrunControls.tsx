'use client';

import type { PromptBarCrunControlsProps } from '@genfeedai/props/studio/prompt-bar.props';
import PromptBarCompactSelect from '@ui/prompt-bars/components/toolbar/PromptBarCompactSelect';
import { useTranslations } from 'next-intl';
import { Fragment, useId } from 'react';

export default function PromptBarCrunControls({
  controls,
  value,
  onChange,
  isDisabled,
  error,
}: PromptBarCrunControlsProps) {
  const translate = useTranslations('pages.studioPlayground');
  const errorId = useId();
  const field = controls.fields.output_format;
  const options =
    field?.enum?.filter(
      (option): option is string => typeof option === 'string',
    ) ?? [];
  if (!options.length) return null;
  return (
    <Fragment>
      <PromptBarCompactSelect
        ariaLabel={translate('crun.outputFormat')}
        describedBy={error ? errorId : undefined}
        icon="format"
        isDisabled={isDisabled}
        isInvalid={Boolean(error)}
        onChange={onChange}
        options={options.map((option) => ({
          label: option.toUpperCase(),
          value: option,
        }))}
        placeholder={translate('crun.outputFormat')}
        value={value ?? String(field?.default ?? options[0])}
      />
      {error ? (
        <span className="sr-only" id={errorId}>
          {error}
        </span>
      ) : null}
    </Fragment>
  );
}

'use client';

import type { PlatformNumberSettingFieldProps } from '@props/admin/platform-settings.props';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

function formatValue(value: number | null): string {
  return value === null ? '' : String(value);
}

/**
 * The committed value for the typed text, `null` for an empty optional field,
 * or `undefined` when the text is not a value the switch accepts.
 */
function parseValue(
  text: string,
  { isInteger, isOptional, max, min }: PlatformNumberSettingFieldProps,
): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') {
    return isOptional ? null : undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) &&
    parsed >= min &&
    parsed <= max &&
    (!isInteger || Number.isInteger(parsed))
    ? parsed
    : undefined;
}

export default function PlatformNumberSettingField(
  props: PlatformNumberSettingFieldProps,
) {
  const {
    helpText,
    id,
    isDisabled,
    isInteger,
    label,
    max,
    min,
    onValidityChange,
    value,
  } = props;
  const translate = useTranslations('pages.platformSettings.features');
  const [text, setText] = useState(() => formatValue(value));
  const [syncedValue, setSyncedValue] = useState(value);

  // Follow a value loaded or saved from the server (adjusting state during
  // render, not in an effect), but never overwrite what the operator is
  // typing when it already means that value ("0." → 0).
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (parseValue(text, props) !== value) {
      setText(formatValue(value));
    }
  }

  const parsed = parseValue(text, props);
  const isValid = parsed !== undefined;

  // The committed value never holds invalid text, so the page must know a
  // field is invalid to refuse the save instead of silently saving the last
  // valid value.
  useEffect(() => {
    onValidityChange(id, isValid);
    return () => onValidityChange(id, true);
  }, [id, isValid, onValidityChange]);
  const error = !isValid
    ? translate(isInteger ? 'invalidInteger' : 'invalidNumber', { max, min })
    : undefined;

  return (
    <Field label={label} htmlFor={id} helpText={helpText} error={error}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={isInteger ? 1 : 0.01}
        placeholder={props.placeholder}
        value={text}
        disabled={isDisabled}
        onChange={(event) => {
          setText(event.target.value);
          const next = parseValue(event.target.value, props);
          if (next !== undefined) {
            props.onCommit(next);
          }
        }}
      />
    </Field>
  );
}

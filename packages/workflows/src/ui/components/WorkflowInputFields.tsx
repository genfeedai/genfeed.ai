'use client';

import { Checkbox } from '@genfeedai/ui/primitives/checkbox';
import Field from '@genfeedai/ui/primitives/field';
import { Input } from '@genfeedai/ui/primitives/input';
import { SelectField } from '@genfeedai/ui/primitives/select';
import { Textarea } from '@genfeedai/ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, useCallback, useMemo, useState } from 'react';

/**
 * One value a workflow run asks for: a declared input variable, or an input a
 * run reported missing. Both the run panel and the missing-input dialog render
 * their fields from this shape.
 */
export interface WorkflowInputFieldDefinition {
  defaultValue?: unknown;
  description?: string;
  key: string;
  label: string;
  required?: boolean;
  type: string;
  validation?: Record<string, unknown>;
}

export type WorkflowInputFormValues = Record<string, unknown>;
type WorkflowInputFormErrors = Record<string, string>;

const LONG_TEXT_FIELD_HINTS = [
  'brief',
  'concept',
  'context',
  'description',
  'instructions',
  'prompt',
  'script',
];

function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  );
}

function buildInitialValues(
  fields: readonly WorkflowInputFieldDefinition[],
): WorkflowInputFormValues {
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      field.defaultValue ?? (field.type === 'boolean' ? false : ''),
    ]),
  );
}

function getSelectOptions(field: WorkflowInputFieldDefinition): string[] {
  const rawOptions = field.validation?.options;

  if (!Array.isArray(rawOptions)) {
    return [];
  }

  return rawOptions
    .map((option) => {
      if (typeof option === 'string') {
        return option;
      }

      if (option && typeof option === 'object') {
        const record = option as Record<string, unknown>;
        const value = record.value ?? record.label;
        return typeof value === 'string' ? value : null;
      }

      return null;
    })
    .filter((option): option is string => Boolean(option));
}

function shouldUseTextarea(field: WorkflowInputFieldDefinition): boolean {
  if (field.type !== 'text') {
    return false;
  }

  const searchText = `${field.key} ${field.label}`.toLowerCase();

  return LONG_TEXT_FIELD_HINTS.some((hint) => searchText.includes(hint));
}

function coerceValue(
  field: WorkflowInputFieldDefinition,
  value: unknown,
): unknown {
  if (field.type === 'number') {
    if (isEmptyValue(value)) {
      return undefined;
    }

    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : value;
  }

  if (field.type === 'boolean') {
    return value === true;
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return value;
}

export interface WorkflowInputForm {
  errors: WorkflowInputFormErrors;
  setFieldValue: (key: string, value: unknown) => void;
  /**
   * Validates the values. Returns the typed values to run with, or `null`
   * after marking every required field that is still empty.
   */
  submit: () => WorkflowInputFormValues | null;
  values: WorkflowInputFormValues;
}

/**
 * State, validation and typing for a set of workflow input fields. The values
 * reset whenever the field definitions change.
 */
export function useWorkflowInputForm(
  fields: readonly WorkflowInputFieldDefinition[],
): WorkflowInputForm {
  const translate = useTranslations('pages.workflows.inputForm');
  const initialValues = useMemo(() => buildInitialValues(fields), [fields]);
  const [previousInitialValues, setPreviousInitialValues] =
    useState(initialValues);
  const [values, setValues] = useState<WorkflowInputFormValues>(initialValues);
  const [errors, setErrors] = useState<WorkflowInputFormErrors>({});

  if (previousInitialValues !== initialValues) {
    setPreviousInitialValues(initialValues);
    setValues(initialValues);
    setErrors({});
  }

  const setFieldValue = useCallback((key: string, value: unknown) => {
    setValues((currentValues) => ({ ...currentValues, [key]: value }));
    setErrors((currentErrors) => {
      if (!currentErrors[key]) {
        return currentErrors;
      }

      const { [key]: _removed, ...nextErrors } = currentErrors;
      return nextErrors;
    });
  }, []);

  const submit = useCallback(() => {
    const nextErrors: WorkflowInputFormErrors = {};

    for (const field of fields) {
      if (field.required && isEmptyValue(values[field.key])) {
        nextErrors[field.key] = translate('required', { label: field.label });
      }
    }
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return null;
    }

    return Object.fromEntries(
      fields.map((field) => [field.key, coerceValue(field, values[field.key])]),
    );
  }, [fields, translate, values]);

  return { errors, setFieldValue, submit, values };
}

interface WorkflowInputFieldsProps {
  errors: WorkflowInputFormErrors;
  fields: readonly WorkflowInputFieldDefinition[];
  /** Prefix of every control id, so two forms on a page never share ids. */
  idPrefix: string;
  onValueChange: (key: string, value: unknown) => void;
  values: WorkflowInputFormValues;
}

function FieldNotes({
  description,
  error,
}: {
  description?: string;
  error?: string;
}) {
  return (
    <>
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </>
  );
}

/** The labelled controls for a set of workflow inputs, one per definition. */
export function WorkflowInputFields({
  errors,
  fields,
  idPrefix,
  onValueChange,
  values,
}: WorkflowInputFieldsProps) {
  const translate = useTranslations('pages.workflows.inputForm');

  const handleTextChange =
    (key: string) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onValueChange(key, event.target.value);
    };

  return (
    <>
      {fields.map((field) => {
        const value = values[field.key];
        const id = `${idPrefix}-${field.key}`;
        const selectOptions = getSelectOptions(field);

        if (field.type === 'boolean') {
          return (
            <div key={field.key} className="flex flex-col gap-1.5">
              <Checkbox
                id={id}
                isChecked={value === true}
                label={field.label}
                onChange={(event) =>
                  onValueChange(field.key, event.target.checked)
                }
              />
              <FieldNotes
                description={field.description}
                error={errors[field.key]}
              />
            </div>
          );
        }

        if (field.type === 'select' && selectOptions.length > 0) {
          return (
            <div key={field.key} className="flex flex-col gap-1.5">
              <SelectField
                error={errors[field.key]}
                isRequired={field.required}
                label={field.label}
                name={id}
                onChange={(event) =>
                  onValueChange(field.key, event.target.value)
                }
                placeholder={translate('selectPlaceholder', {
                  label: field.label,
                })}
                value={typeof value === 'string' ? value : ''}
              >
                {selectOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectField>
              <FieldNotes description={field.description} />
            </div>
          );
        }

        return (
          <Field
            key={field.key}
            description={field.description}
            error={errors[field.key]}
            htmlFor={id}
            isRequired={field.required}
            label={field.label}
          >
            {field.type === 'number' ? (
              <Input
                type="number"
                value={
                  typeof value === 'number' || typeof value === 'string'
                    ? value
                    : ''
                }
                onChange={handleTextChange(field.key)}
              />
            ) : shouldUseTextarea(field) ? (
              <Textarea
                rows={4}
                value={typeof value === 'string' ? value : ''}
                onChange={handleTextChange(field.key)}
                className="resize-none"
              />
            ) : (
              <Input
                type="text"
                value={typeof value === 'string' ? value : ''}
                onChange={handleTextChange(field.key)}
                placeholder={
                  field.type === 'image' || field.type === 'asset'
                    ? 'https://...'
                    : undefined
                }
              />
            )}
          </Field>
        );
      })}
    </>
  );
}

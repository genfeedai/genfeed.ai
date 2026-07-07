'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { Loader2, Play, X } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useMemo, useState } from 'react';
import type { WorkflowInputVariable } from '@/features/workflows/services/workflow-api';

interface WorkflowRunPanelProps {
  inputVariables: WorkflowInputVariable[];
  isRunning: boolean;
  onClose: () => void;
  onRun: (
    inputValues: Record<string, unknown>,
    options: { saveDefaults: boolean },
  ) => Promise<void> | void;
}

type FormValues = Record<string, unknown>;
type FieldErrors = Record<string, string>;

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
  inputVariables: WorkflowInputVariable[],
): FormValues {
  return Object.fromEntries(
    inputVariables.map((variable) => [
      variable.key,
      variable.defaultValue ??
        (variable.type === 'boolean'
          ? false
          : variable.type === 'number'
            ? ''
            : ''),
    ]),
  );
}

function getSelectOptions(variable: WorkflowInputVariable): string[] {
  const rawOptions = variable.validation?.options;

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

function shouldUseTextarea(variable: WorkflowInputVariable): boolean {
  if (variable.type !== 'text') {
    return false;
  }

  const searchText = `${variable.key} ${variable.label}`.toLowerCase();

  return LONG_TEXT_FIELD_HINTS.some((hint) => searchText.includes(hint));
}

function coerceValue(variable: WorkflowInputVariable, value: unknown): unknown {
  if (variable.type === 'number') {
    if (isEmptyValue(value)) {
      return undefined;
    }

    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : value;
  }

  if (variable.type === 'boolean') {
    return value === true;
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return value;
}

function validateForm(
  inputVariables: WorkflowInputVariable[],
  values: FormValues,
): FieldErrors {
  const errors: FieldErrors = {};

  for (const variable of inputVariables) {
    const value = values[variable.key];

    if (variable.required && isEmptyValue(value)) {
      errors[variable.key] = `${variable.label} is required`;
    }
  }

  return errors;
}

export function WorkflowRunPanel({
  inputVariables,
  isRunning,
  onClose,
  onRun,
}: WorkflowRunPanelProps) {
  const initialValues = useMemo(
    () => buildInitialValues(inputVariables),
    [inputVariables],
  );
  const [previousInitialValues, setPreviousInitialValues] =
    useState(initialValues);
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveDefaults, setSaveDefaults] = useState(false);

  if (previousInitialValues !== initialValues) {
    setPreviousInitialValues(initialValues);
    setValues(initialValues);
    setErrors({});
  }

  const setFieldValue = (key: string, value: unknown) => {
    setValues((currentValues) => ({ ...currentValues, [key]: value }));
    setErrors((currentErrors) => {
      if (!currentErrors[key]) {
        return currentErrors;
      }

      const { [key]: _removed, ...nextErrors } = currentErrors;
      return nextErrors;
    });
  };

  const handleTextChange =
    (key: string) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFieldValue(key, event.target.value);
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validateForm(inputVariables, values);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const inputValues = Object.fromEntries(
      inputVariables.map((variable) => [
        variable.key,
        coerceValue(variable, values[variable.key]),
      ]),
    );

    await onRun(inputValues, { saveDefaults });
  };

  return (
    <aside className="absolute top-0 right-0 bottom-0 flex w-96 flex-col border-l border-white/[0.08] bg-card shadow-xl">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <h2 className="font-semibold">Run workflow</h2>
        <Button
          ariaLabel="Close"
          icon={<X className="size-4" />}
          onClick={onClose}
          size={ButtonSize.ICON}
          tooltip="Close"
          variant={ButtonVariant.GHOST}
        />
      </div>

      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {inputVariables.map((variable) => {
            const value = values[variable.key];
            const error = errors[variable.key];
            const selectOptions = getSelectOptions(variable);

            return (
              <div key={variable.key} className="space-y-1.5">
                <label
                  htmlFor={`workflow-run-${variable.key}`}
                  className="block text-sm font-medium text-foreground"
                >
                  {variable.label}
                  {variable.required ? ' *' : ''}
                </label>
                {variable.description && (
                  <p className="text-xs leading-5 text-muted-foreground">
                    {variable.description}
                  </p>
                )}

                {variable.type === 'boolean' ? (
                  <label className="flex items-center gap-2 border border-border px-3 py-2 text-sm text-foreground">
                    <Checkbox
                      isChecked={value === true}
                      onChange={(event) =>
                        setFieldValue(variable.key, event.target.checked)
                      }
                    />
                    <span>{variable.label}</span>
                  </label>
                ) : variable.type === 'select' && selectOptions.length > 0 ? (
                  <Select
                    value={typeof value === 'string' ? value : ''}
                    onValueChange={(nextValue) =>
                      setFieldValue(variable.key, nextValue)
                    }
                  >
                    <SelectTrigger id={`workflow-run-${variable.key}`}>
                      <SelectValue placeholder={`Select ${variable.label}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {selectOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : variable.type === 'number' ? (
                  <Input
                    id={`workflow-run-${variable.key}`}
                    type="number"
                    value={
                      typeof value === 'number' || typeof value === 'string'
                        ? value
                        : ''
                    }
                    onChange={handleTextChange(variable.key)}
                  />
                ) : shouldUseTextarea(variable) ? (
                  <Textarea
                    id={`workflow-run-${variable.key}`}
                    rows={4}
                    value={typeof value === 'string' ? value : ''}
                    onChange={handleTextChange(variable.key)}
                    className="resize-none"
                  />
                ) : (
                  <Input
                    id={`workflow-run-${variable.key}`}
                    type="text"
                    value={typeof value === 'string' ? value : ''}
                    onChange={handleTextChange(variable.key)}
                    placeholder={
                      variable.type === 'image' || variable.type === 'asset'
                        ? 'https://...'
                        : undefined
                    }
                  />
                )}

                {error && <p className="text-xs text-destructive">{error}</p>}
              </div>
            );
          })}
        </div>

        <div className="space-y-3 border-t border-white/[0.08] p-4">
          <Checkbox
            isChecked={saveDefaults}
            label={
              <span className="text-sm text-foreground">
                Save as defaults for scheduled runs
              </span>
            }
            onChange={(event) => setSaveDefaults(event.target.checked)}
          />
          <Button
            className="w-full"
            icon={
              isRunning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )
            }
            isLoading={isRunning}
            size={ButtonSize.SM}
            type="submit"
            variant={ButtonVariant.DEFAULT}
          >
            Run
          </Button>
        </div>
      </form>
    </aside>
  );
}

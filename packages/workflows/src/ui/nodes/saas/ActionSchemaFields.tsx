'use client';

import { Checkbox } from '@genfeedai/ui/primitives/checkbox';
import { Input } from '@genfeedai/ui/primitives/input';
import { Label } from '@genfeedai/ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@genfeedai/ui/primitives/select';
import { Textarea } from '@genfeedai/ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  type ActionSchemaProperty,
  formatActionFieldLabel,
  readActionObjectSchema,
  unwrapActionSchemaProperty,
} from './action-schema';

interface ActionSchemaFieldsProps {
  disabled?: boolean;
  onChange: (field: string, value: unknown) => void;
  schema: object;
  values: Record<string, unknown>;
}

interface ActionFieldProps {
  disabled: boolean;
  field: string;
  onChange: (value: unknown) => void;
  property: ActionSchemaProperty;
  required: boolean;
  value: unknown;
}

function JsonField({
  disabled,
  field,
  onChange,
  value,
}: Pick<ActionFieldProps, 'disabled' | 'field' | 'onChange' | 'value'>) {
  const translate = useTranslations('pages.workflows.actionSchema');
  const serializedValue = useMemo(
    () => (value === undefined ? '' : JSON.stringify(value, null, 2)),
    [value],
  );
  const [draft, setDraft] = useState(serializedValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(serializedValue);
    setError(null);
  }, [serializedValue]);

  const commit = useCallback(() => {
    if (!draft.trim()) {
      onChange(undefined);
      setError(null);
      return;
    }

    try {
      onChange(JSON.parse(draft));
      setError(null);
    } catch {
      setError(translate('invalidJson'));
    }
  }, [draft, onChange, translate]);

  return (
    <>
      <Textarea
        id={`action-field-${field}`}
        value={draft}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        className="nodrag nopan min-h-24 font-mono text-xs"
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </>
  );
}

function ActionField({
  disabled,
  field,
  onChange,
  property,
  required,
  value,
}: ActionFieldProps) {
  const translate = useTranslations('pages.workflows.actionSchema');
  const resolved = unwrapActionSchemaProperty(property);
  const label = formatActionFieldLabel(field, property.title);
  const fieldId = `action-field-${field}`;
  const enumOptions = resolved.enum?.filter(
    (option): option is string => typeof option === 'string',
  );
  const description = property.description ?? resolved.description;
  const isStringArray =
    resolved.type === 'array' &&
    unwrapActionSchemaProperty(resolved.items ?? {}).type === 'string';

  let control: ReactNode;

  if (enumOptions && enumOptions.length > 0) {
    control = (
      <Select
        value={typeof value === 'string' ? value : undefined}
        disabled={disabled}
        onValueChange={onChange}
      >
        <SelectTrigger id={fieldId} className="nodrag h-8 w-full">
          <SelectValue placeholder={translate('select')} />
        </SelectTrigger>
        <SelectContent>
          {enumOptions.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else if (resolved.type === 'boolean') {
    control = (
      <Checkbox
        id={fieldId}
        checked={typeof value === 'boolean' ? value : false}
        disabled={disabled}
        onCheckedChange={(checked) => onChange(checked === true)}
      />
    );
  } else if (resolved.type === 'number' || resolved.type === 'integer') {
    control = (
      <Input
        id={fieldId}
        className="nodrag nopan h-8"
        disabled={disabled}
        type="number"
        step={resolved.type === 'integer' ? 1 : 'any'}
        value={typeof value === 'number' ? value : ''}
        onChange={(event) =>
          onChange(
            event.target.value === '' ? undefined : Number(event.target.value),
          )
        }
      />
    );
  } else if (isStringArray) {
    control = (
      <Input
        id={fieldId}
        className="nodrag nopan h-8"
        disabled={disabled}
        value={Array.isArray(value) ? value.join(', ') : ''}
        placeholder={translate('separateValues')}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean),
          )
        }
      />
    );
  } else if (
    resolved.type === 'object' ||
    resolved.type === 'array' ||
    resolved.type === undefined
  ) {
    control = (
      <JsonField
        disabled={disabled}
        field={field}
        onChange={onChange}
        value={value}
      />
    );
  } else if (
    /(content|html|instructions|prompt|script|template)/i.test(field)
  ) {
    control = (
      <Textarea
        id={fieldId}
        className="nodrag nopan min-h-20"
        disabled={disabled}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  } else {
    control = (
      <Input
        id={fieldId}
        className="nodrag nopan h-8"
        disabled={disabled}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={fieldId} className="text-xs text-foreground">
          {label}
          {required ? (
            <>
              <span className="ml-1 text-destructive" aria-hidden="true">
                *
              </span>
              <span className="sr-only"> {translate('required')}</span>
            </>
          ) : null}
        </Label>
      </div>
      {control}
      {description ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function ActionSchemaFields({
  disabled = false,
  onChange,
  schema,
  values,
}: ActionSchemaFieldsProps) {
  const translate = useTranslations('pages.workflows.actionSchema');
  const { properties, required } = readActionObjectSchema(schema);
  const entries = Object.entries(properties);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {translate('noConfigurableInputs')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map(([field, property]) => (
        <ActionField
          key={field}
          disabled={disabled}
          field={field}
          onChange={(value) => onChange(field, value)}
          property={property}
          required={required.has(field)}
          value={values[field] ?? property.default}
        />
      ))}
    </div>
  );
}

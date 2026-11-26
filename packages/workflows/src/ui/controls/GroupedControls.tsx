'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@genfeedai/ui/primitives/button';
import Field from '@genfeedai/ui/primitives/field';
import { Label } from '@genfeedai/ui/primitives/label';
import { OptionSelect } from '@genfeedai/ui/primitives/option-select';
import { Slider } from '@genfeedai/ui/primitives/slider';
import { Switch } from '@genfeedai/ui/primitives/switch';
import { useId } from 'react';
import type { ControlAction, ControlField, ControlGroup } from './types';

interface GroupedControlsProps {
  groups: ControlGroup[];
  /** Keeps field ids unique when two nodes render the same schema. */
  idPrefix?: string;
  onChange: (fieldId: string, value: unknown) => void;
  values: Record<string, unknown>;
}

interface ControlGroupSectionProps {
  fields: ControlField[];
  group: ControlGroup;
  idPrefix: string;
  onChange: (fieldId: string, value: unknown) => void;
  values: Record<string, unknown>;
}

interface ControlFieldViewProps {
  field: ControlField;
  idPrefix: string;
  onChange: (value: unknown) => void;
  value: unknown;
}

/**
 * One schema-driven renderer for a node's inputs: labeled groups, accessible fields, validation,
 * help text and the actions a field declares. A node (or the inspector) hands it a description of
 * its controls; it knows nothing about any provider.
 */
export default function GroupedControls({
  groups,
  idPrefix = '',
  onChange,
  values,
}: GroupedControlsProps) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => {
        const fields = group.fields.filter(
          (field) => field.isVisible?.(values) ?? true,
        );
        if (fields.length === 0) {
          return null;
        }
        return (
          <ControlGroupSection
            fields={fields}
            group={group}
            idPrefix={idPrefix}
            key={group.id}
            onChange={onChange}
            values={values}
          />
        );
      })}
    </div>
  );
}

function ControlGroupSection({
  fields,
  group,
  idPrefix,
  onChange,
  values,
}: ControlGroupSectionProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3"
      role="group"
    >
      <div className="flex flex-col gap-0.5 border-b border-border pb-1.5">
        <h3
          className="text-xs font-semibold uppercase tracking-label text-muted-foreground"
          id={headingId}
        >
          {group.label}
        </h3>
        {group.description ? (
          <p className="text-xs text-muted-foreground">{group.description}</p>
        ) : null}
      </div>
      {fields.map((field) => (
        <ControlFieldView
          field={field}
          idPrefix={idPrefix}
          key={field.id}
          onChange={(value) => onChange(field.id, value)}
          value={values[field.id]}
        />
      ))}
    </section>
  );
}

function FieldActions({ actions }: { actions?: ControlAction[] }) {
  if (!actions || actions.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          disabled={Boolean(action.disabledReason)}
          icon={action.icon}
          key={action.id}
          onClick={action.onSelect}
          size={ButtonSize.SM}
          textTransform="none"
          tooltip={action.disabledReason}
          variant={
            action.isPrimary ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY
          }
          withWrapper={false}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}

function ControlFieldView({
  field,
  idPrefix,
  onChange,
  value,
}: ControlFieldViewProps) {
  const fieldId = `control-${idPrefix}${field.id}`;
  const describedBy =
    [
      field.help ? `${fieldId}-help` : null,
      field.error ? `${fieldId}-error` : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  if (field.kind === 'select') {
    return (
      <Field
        error={field.error}
        helpText={field.help}
        htmlFor={fieldId}
        label={field.label}
      >
        <OptionSelect
          ariaLabel={field.label}
          className="nodrag"
          onValueChange={onChange}
          options={field.options}
          value={String(value ?? '')}
        />
      </Field>
    );
  }

  if (field.kind === 'slider') {
    const current = typeof value === 'number' ? value : field.min;
    return (
      <div className="flex w-full flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor={fieldId}>{field.label}</Label>
          <span className="text-xs tabular-nums text-muted-foreground">
            {current}
            {field.unit ?? ''}
          </span>
        </div>
        <Slider
          aria-describedby={describedBy}
          aria-label={field.label}
          className="nodrag"
          id={fieldId}
          max={field.max}
          min={field.min}
          onValueChange={([next]) => onChange(next)}
          step={field.step}
          value={[current]}
        />
        {field.help ? (
          <p className="text-sm text-muted-foreground" id={`${fieldId}-help`}>
            {field.help}
          </p>
        ) : null}
        {field.error ? (
          <p
            className="text-sm text-destructive"
            id={`${fieldId}-error`}
            role="alert"
          >
            {field.error}
          </p>
        ) : null}
      </div>
    );
  }

  if (field.kind === 'switch') {
    return (
      <div className="flex flex-col gap-1.5">
        <Switch
          description={field.help}
          isChecked={Boolean(value)}
          label={field.label}
          onCheckedChange={onChange}
        />
        {field.error ? (
          <p
            className="text-sm text-destructive"
            id={`${fieldId}-error`}
            role="alert"
          >
            {field.error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      <p className="text-sm font-medium text-foreground">{field.label}</p>
      <p
        aria-describedby={describedBy}
        className={`rounded-md border bg-muted/40 px-3 py-2 text-sm text-foreground ${field.error ? 'border-destructive' : 'border-border'}`}
        id={fieldId}
      >
        {field.summary}
      </p>
      {field.help ? (
        <p className="text-sm text-muted-foreground" id={`${fieldId}-help`}>
          {field.help}
        </p>
      ) : null}
      {field.error ? (
        <p
          className="text-sm text-destructive"
          id={`${fieldId}-error`}
          role="alert"
        >
          {field.error}
        </p>
      ) : null}
      <FieldActions actions={field.actions} />
    </div>
  );
}

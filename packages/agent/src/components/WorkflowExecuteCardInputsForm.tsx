import type { WorkflowInterfaceField } from '@genfeedai/agent/services/agent-api.service';
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
import type { ChangeEvent, ReactElement } from 'react';

type WorkflowExecuteCardInputsFormProps = {
  inputEntries: [string, WorkflowInterfaceField][];
  formValues: Record<string, unknown>;
  onTextChange: (
    key: string,
  ) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onChange: (key: string, value: unknown) => void;
};

export function WorkflowExecuteCardInputsForm({
  inputEntries,
  formValues,
  onTextChange,
  onChange,
}: WorkflowExecuteCardInputsFormProps): ReactElement {
  return (
    <div className="space-y-3 border border-border p-3">
      {inputEntries.map(([key, field]) => {
        const label = field.label ?? key;
        const value = formValues[key];

        return (
          <div key={key}>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {label}
              {field.required ? ' *' : ''}
            </label>
            {field.description && (
              <p className="mb-1 text-xs text-muted-foreground">
                {field.description}
              </p>
            )}
            {field.type === 'boolean' ? (
              <label className="flex items-center gap-2 border border-border px-2.5 py-2 text-sm text-foreground">
                <Checkbox
                  isChecked={Boolean(value)}
                  onChange={(event) => onChange(key, event.target.checked)}
                />
                <span>{label}</span>
              </label>
            ) : field.type === 'select' &&
              Array.isArray(field.validation?.options) ? (
              <Select
                value={typeof value === 'string' ? value : ''}
                onValueChange={(val) => onChange(key, val)}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !field.required ? 'Optional' : `Select ${label}`
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {!field.required && (
                    <SelectItem value="">Optional</SelectItem>
                  )}
                  {field.validation.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field.type === 'number' ? (
              <Input
                type="number"
                value={
                  typeof value === 'number' || typeof value === 'string'
                    ? value
                    : ''
                }
                onChange={(event) => onChange(key, event.target.value)}
              />
            ) : field.type === 'text' &&
              key.toLowerCase().includes('script') ? (
              <Textarea
                rows={3}
                value={typeof value === 'string' ? value : ''}
                onChange={onTextChange(key)}
                className="resize-none"
              />
            ) : (
              <Input
                type="text"
                value={typeof value === 'string' ? value : ''}
                onChange={onTextChange(key)}
                placeholder={
                  field.type === 'image' || field.type === 'audio'
                    ? 'https://...'
                    : undefined
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

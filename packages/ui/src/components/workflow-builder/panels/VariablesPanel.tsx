'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import type {
  InputVariableType,
  WorkflowInputVariable,
} from '@genfeedai/interfaces/automation/workflow-builder.interface';
import type { VariablesPanelProps } from '@genfeedai/props/automation/workflow-builder.props';
import Badge from '@ui/display/badge/Badge';
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
import { useCallback, useState } from 'react';
import {
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineVariable,
} from 'react-icons/hi2';

const VARIABLE_TYPES: Array<{ value: InputVariableType; label: string }> = [
  { label: 'Text', value: 'text' },
  { label: 'Number', value: 'number' },
  { label: 'Boolean', value: 'boolean' },
  { label: 'Select', value: 'select' },
  { label: 'Image', value: 'image' },
  { label: 'Video', value: 'video' },
  { label: 'Asset', value: 'asset' },
];

interface VariableItemProps {
  variable: WorkflowInputVariable;
  onUpdate: (updates: Partial<WorkflowInputVariable>) => void;
  onDelete: () => void;
}

function VariableItem({ variable, onUpdate, onDelete }: VariableItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className=" border border-white/[0.08] bg-card">
      <div
        className="flex cursor-pointer items-center gap-2 p-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <HiOutlineVariable className="h-4 w-4 text-primary" />
        <span className="flex-1 font-medium text-sm">{variable.label}</span>
        <Badge variant="ghost" size={ComponentSize.SM}>
          {variable.type}
        </Badge>
        {isExpanded ? (
          <HiOutlineChevronUp className="h-4 w-4" />
        ) : (
          <HiOutlineChevronDown className="h-4 w-4" />
        )}
      </div>

      {isExpanded && (
        <div className="border-t border-white/[0.08] p-3 space-y-3">
          <div>
            <label className="text-xs font-medium">Key</label>
            <Input
              type="text"
              className="mt-1 h-8"
              value={variable.key}
              onChange={(e) => onUpdate({ key: e.target.value })}
              placeholder="variable_key"
            />
          </div>

          <div>
            <label className="text-xs font-medium">Label</label>
            <Input
              type="text"
              className="mt-1 h-8"
              value={variable.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              placeholder="Display Label"
            />
          </div>

          <div>
            <label className="text-xs font-medium">Type</label>
            <Select
              value={variable.type}
              onValueChange={(value) =>
                onUpdate({ type: value as InputVariableType })
              }
            >
              <SelectTrigger className="mt-1 h-8">
                <SelectValue placeholder="Select a type" />
              </SelectTrigger>
              <SelectContent>
                {VARIABLE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium">Description</label>
            <Input
              type="text"
              className="mt-1 h-8"
              value={variable.description || ''}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="Help text for users"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              checked={variable.required || false}
              onCheckedChange={(checked) =>
                onUpdate({ required: checked === true })
              }
              aria-label={`Toggle required for ${variable.label}`}
            />
            <label className="text-sm">Required</label>
          </div>

          <Button
            type="button"
            variant={ButtonVariant.DESTRUCTIVE}
            size={ButtonSize.SM}
            className="w-full"
            onClick={onDelete}
            icon={<HiOutlineTrash className="h-4 w-4" />}
            label="Delete Variable"
          />
        </div>
      )}
    </div>
  );
}

export default function VariablesPanel({
  variables,
  onAdd,
  onUpdate,
  onDelete,
  isCollapsed = false,
  onToggleCollapse,
}: VariablesPanelProps) {
  const handleAddVariable = useCallback(() => {
    const newKey = `variable_${variables.length + 1}`;
    onAdd({
      key: newKey,
      label: `Variable ${variables.length + 1}`,
      required: false,
      type: 'text',
    });
  }, [variables.length, onAdd]);

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div
        className="flex cursor-pointer items-center justify-between border-b border-white/[0.08] px-4 py-3"
        onClick={onToggleCollapse}
      >
        <span className="font-semibold text-sm">Input Variables</span>
        <div className="flex items-center gap-2">
          <Badge variant="ghost" size={ComponentSize.SM}>
            {variables.length}
          </Badge>
          {isCollapsed ? (
            <HiOutlineChevronDown className="h-4 w-4" />
          ) : (
            <HiOutlineChevronUp className="h-4 w-4" />
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-4 space-y-3">
          {variables.length === 0 ? (
            <p className="text-sm opacity-60 text-center py-4">
              No input variables defined.
              <br />
              Add variables to make parts of your workflow customizable.
            </p>
          ) : (
            variables.map((variable) => (
              <VariableItem
                key={variable.key}
                variable={variable}
                onUpdate={(updates) => onUpdate(variable.key, updates)}
                onDelete={() => onDelete(variable.key)}
              />
            ))
          )}

          <Button
            type="button"
            variant={ButtonVariant.OUTLINE}
            size={ButtonSize.SM}
            className="w-full"
            onClick={handleAddVariable}
            icon={<HiOutlinePlus className="h-4 w-4" />}
            label="Add Variable"
          />
        </div>
      )}
    </div>
  );
}

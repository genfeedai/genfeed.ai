'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { NodeConfigField } from '@genfeedai/interfaces/automation/workflow-builder.interface';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { NodeConfigPanelProps } from '@props/automation/workflow-builder.props';
import Button from '@ui/buttons/base/Button';
import Textarea from '@ui/inputs/textarea/Textarea';
import { Checkbox } from '@ui/primitives/checkbox';
import { ColorInput } from '@ui/primitives/color-input';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Slider } from '@ui/primitives/slider';
import { useCallback, useState } from 'react';
import { HiOutlineVariable, HiOutlineXMark } from 'react-icons/hi2';

interface ConfigFieldProps {
  fieldKey: string;
  field: NodeConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  variables: string[];
}

function ConfigField({
  fieldKey,
  field,
  value,
  onChange,
  variables,
}: ConfigFieldProps) {
  const [useVariable, setUseVariable] = useState(false);

  const renderField = () => {
    if (useVariable) {
      return (
        <Select
          value={String(value || '')}
          onValueChange={(selectedValue) =>
            onChange(fieldKey, `{{${selectedValue}}}`)
          }
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Select variable..." />
          </SelectTrigger>
          <SelectContent>
            {variables.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    switch (field.type) {
      case 'text':
        return (
          <Input
            type="text"
            className="h-8"
            value={String(value || field.defaultValue || '')}
            placeholder={field.placeholder}
            onChange={(e) => onChange(fieldKey, e.target.value)}
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            className="h-8"
            value={Number(value || field.defaultValue || 0)}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={(e) => onChange(fieldKey, parseFloat(e.target.value))}
          />
        );

      case 'range':
        return (
          <div className="flex items-center gap-2">
            <Slider
              className="flex-1"
              value={[Number(value || field.defaultValue || field.min || 0)]}
              min={field.min}
              max={field.max}
              step={field.step}
              onValueChange={([sliderValue]) => onChange(fieldKey, sliderValue)}
            />
            <span className="text-sm tabular-nums w-12 text-right">
              {Number(value || field.defaultValue || field.min || 0)}
            </span>
          </div>
        );

      case 'select':
        return (
          <Select
            value={String(value || field.defaultValue || '')}
            onValueChange={(selectedValue) => onChange(fieldKey, selectedValue)}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'boolean':
        return (
          <Checkbox
            checked={Boolean(value ?? field.defaultValue ?? false)}
            onCheckedChange={(checked) => onChange(fieldKey, checked === true)}
            aria-label={field.label}
          />
        );

      case 'textarea':
        return (
          <Textarea
            className="text-sm border border-input px-3 py-2 w-full"
            value={String(value || field.defaultValue || '')}
            placeholder={field.placeholder}
            rows={3}
            onChange={(e) => onChange(fieldKey, e.target.value)}
          />
        );

      case 'color':
        return (
          <ColorInput
            className="h-8 w-full"
            value={String(value || field.defaultValue || '#000000')}
            onChange={(e) => onChange(fieldKey, e.target.value)}
          />
        );

      default:
        return (
          <Input
            type="text"
            className="h-8"
            value={String(value || '')}
            onChange={(e) => onChange(fieldKey, e.target.value)}
          />
        );
    }
  };

  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between">
        <label className="text-sm font-medium">
          {field.label}
          {field.required && <span className="text-error ml-1">*</span>}
        </label>
        {variables.length > 0 && (
          <Button
            type="button"
            variant={ButtonVariant.GHOST}
            size={ButtonSize.XS}
            className={cn(useVariable && 'text-primary')}
            onClick={() => setUseVariable(!useVariable)}
            ariaLabel="Use variable"
            icon={<HiOutlineVariable className="h-4 w-4" />}
          />
        )}
      </div>
      {renderField()}
      {field.description && (
        <p className="mt-1 text-xs opacity-60">{field.description}</p>
      )}
    </div>
  );
}

export default function NodeConfigPanel({
  selectedNode,
  onUpdateConfig,
  inputVariables,
  onClose,
}: NodeConfigPanelProps) {
  if (!selectedNode) {
    return null;
  }

  const { data } = selectedNode;
  const { definition, config } = data;
  const configSchema = definition?.configSchema || {};

  const handleConfigChange = useCallback(
    (key: string, value: unknown) => {
      onUpdateConfig(selectedNode.id, { ...config, [key]: value });
    },
    [selectedNode.id, config, onUpdateConfig],
  );

  const variableKeys = inputVariables.map((v) => v.key);

  return (
    <div className="border-b border-white/[0.08] bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <div>
          <h3 className="font-semibold">{data.label}</h3>
          <p className="text-xs opacity-60">{definition?.description}</p>
        </div>
        <Button
          type="button"
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
          onClick={onClose}
          icon={<HiOutlineXMark className="h-4 w-4" />}
        />
      </div>

      {/* Config Fields */}
      <div className="max-h-80 overflow-y-auto p-4">
        {Object.keys(configSchema).length > 0 ? (
          Object.entries(configSchema).map(([fieldKey, field]) => (
            <ConfigField
              key={fieldKey}
              fieldKey={fieldKey}
              field={field}
              value={config[fieldKey]}
              onChange={handleConfigChange}
              variables={variableKeys}
            />
          ))
        ) : (
          <p className="text-sm opacity-60">No configuration options</p>
        )}
      </div>
    </div>
  );
}

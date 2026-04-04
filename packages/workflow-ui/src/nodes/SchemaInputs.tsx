'use client';

import { memo, useCallback, useMemo } from 'react';
import { Checkbox } from '../ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Slider } from '../ui/slider';
import { NegativePromptSelector } from './NegativePromptSelector';

/**
 * JSON Schema property definition
 * These come from Replicate model schemas
 */
export interface SchemaProperty {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  'x-order'?: number;
  allOf?: Array<{ $ref: string }>;
  enum?: string[];
  nullable?: boolean;
}

interface ComponentSchema {
  enum?: unknown[];
  type?: string;
}

interface SchemaInputsProps {
  schema: Record<string, SchemaProperty> | undefined;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** Custom enum values map - key is the $ref path, value is array of enum options */
  enumValues?: Record<string, string[]>;
  /** Component schemas with type info for proper type coercion */
  componentSchemas?: Record<string, ComponentSchema>;
  /** Disable all inputs (e.g. during processing) */
  disabled?: boolean;
}

// Fields that come from node connections and should be skipped
const CONNECTION_FIELDS = new Set([
  'prompt',
  'image',
  'image_input',
  'video',
  'audio',
  'start_image',
  'first_frame_image',
  'last_frame',
  'reference_images',
  'image_url',
  'video_url',
  'end_image',
  'start_video_id',
  'end_video_id',
  'subject_reference', // minimax S2V mode character reference
  'image_prompt', // flux-1.1-pro Redux image prompt
  'mask', // sdxl inpainting mask
]);

// Common enum values from Replicate schemas
// These map to the $ref values in allOf definitions
const DEFAULT_ENUM_VALUES: Record<string, string[]> = {
  // Aspect ratios
  aspect_ratio: [
    'match_input_image',
    '1:1',
    '16:9',
    '9:16',
    '4:3',
    '3:4',
    '3:2',
    '2:3',
    '21:9',
    '9:21',
    '4:5',
    '5:4',
  ],
  // Character orientation
  character_orientation: ['image', 'video'],
  // Video duration
  duration: ['4', '5', '6', '8', '10'],
  // Megapixels
  megapixels: ['0.25', '1', '2'],
  // Video model mode
  mode: ['std', 'pro'],
  // Luma models
  model: ['photon-flash-1', 'photon-1'],
  // Output formats
  output_format: ['jpg', 'png', 'webp'],
  // Refine options
  refine: ['no_refiner', 'expert_ensemble_refiner', 'base_image_refiner'],
  // Resolution options
  resolution: ['1K', '2K', '4K', '720p', '1080p'],
  // Safety filter level
  safety_filter_level: [
    'block_only_high',
    'block_medium_and_above',
    'block_low_and_above',
  ],
  // Scheduler options
  scheduler: ['K_EULER', 'K_EULER_ANCESTRAL', 'DDIM', 'DPM_SOLVER', 'PNDM'],
  // Sync mode
  sync_mode: ['loop', 'bounce', 'cut_off', 'silence', 'remap'],
};

/**
 * Extract enum key from $ref path
 * e.g., "#/components/schemas/aspect_ratio" -> "aspect_ratio"
 */
function getEnumKey(refPath: string): string {
  const parts = refPath.split('/');
  return parts[parts.length - 1];
}

/**
 * Format property name for display
 * e.g., "aspect_ratio" -> "Aspect Ratio"
 */
function formatLabel(key: string, title?: string): string {
  if (title) return title;
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Render a select dropdown for enum values
 */
function EnumSelect({
  propertyKey,
  property,
  value,
  options,
  onChange,
}: {
  propertyKey: string;
  property: SchemaProperty;
  value: unknown;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">
        {formatLabel(propertyKey, property.title)}
      </label>
      <Select
        value={String(value ?? property.default ?? options[0])}
        onValueChange={onChange}
      >
        <SelectTrigger className="nodrag h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Render a slider with number input for numeric values with min/max
 */
function SliderInput({
  propertyKey,
  property,
  value,
  onChange,
}: {
  propertyKey: string;
  property: SchemaProperty;
  value: unknown;
  onChange: (value: number) => void;
}) {
  const min = property.minimum ?? 0;
  const max = property.maximum ?? 100;
  const step = property.type === 'integer' ? 1 : 0.1;
  const currentValue =
    typeof value === 'number' ? value : ((property.default as number) ?? min);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">
        {formatLabel(propertyKey, property.title)}
      </label>

      <div className="flex items-center gap-2 nodrag">
        <Slider
          value={[currentValue]}
          min={min}
          max={max}
          step={step}
          onValueChange={([val]) => onChange(val)}
          className="flex-1"
        />

        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={currentValue}
          onChange={(e) => onChange(Number(e.target.value))}
          className="nodrag nopan w-16 h-7 rounded-md border border-input bg-background px-2 text-xs text-center shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
    </div>
  );
}

/**
 * Render a checkbox for boolean values
 */
function CheckboxInput({
  propertyKey,
  property,
  value,
  onChange,
}: {
  propertyKey: string;
  property: SchemaProperty;
  value: unknown;
  onChange: (value: boolean) => void;
}) {
  const checked =
    typeof value === 'boolean'
      ? value
      : ((property.default as boolean) ?? false);
  const inputId = `schema-checkbox-${propertyKey}`;

  return (
    <div className="flex items-center gap-2 nodrag">
      <Checkbox
        id={inputId}
        checked={checked}
        onCheckedChange={(checkedState) => {
          if (typeof checkedState === 'boolean') {
            onChange(checkedState);
          }
        }}
      />
      <label
        htmlFor={inputId}
        className="text-sm text-foreground cursor-pointer"
      >
        {formatLabel(propertyKey, property.title)}
      </label>
    </div>
  );
}

/**
 * Render a simple number input for numeric values without range constraints
 */
function NumberInput({
  propertyKey,
  property,
  value,
  onChange,
}: {
  propertyKey: string;
  property: SchemaProperty;
  value: unknown;
  onChange: (value: number | null) => void;
}) {
  const currentValue =
    typeof value === 'number'
      ? value
      : (property.default as number | undefined);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">
        {formatLabel(propertyKey, property.title)}
      </label>
      <input
        type="number"
        value={currentValue ?? ''}
        placeholder={property.nullable ? 'Random' : undefined}
        onChange={(e) => {
          const val = e.target.value;
          onChange(val === '' ? null : Number(val));
        }}
        className="nodrag nopan w-full h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
  );
}

function SchemaInputsComponent({
  schema,
  values,
  onChange,
  enumValues,
  componentSchemas,
  disabled,
}: SchemaInputsProps) {
  const handleChange = useCallback(
    (key: string, value: unknown) => {
      onChange(key, value);
    },
    [onChange],
  );

  // Sort properties by x-order and filter out connection fields
  const sortedProperties = useMemo(() => {
    if (!schema) return [];

    return Object.entries(schema)
      .filter(([key]) => !CONNECTION_FIELDS.has(key))
      .sort((a, b) => {
        const orderA = a[1]['x-order'] ?? 999;
        const orderB = b[1]['x-order'] ?? 999;
        return orderA - orderB;
      });
  }, [schema]);

  if (!schema || sortedProperties.length === 0) {
    return null;
  }

  return (
    <div
      className={`flex flex-col gap-2${disabled ? ' pointer-events-none opacity-50' : ''}`}
    >
      {sortedProperties.map(([key, property]) => {
        const value = values[key];

        // Negative prompt - render checkbox selector
        if (key === 'negative_prompt' && property.type === 'string') {
          return (
            <NegativePromptSelector
              key={key}
              value={(value as string) ?? ''}
              onChange={(v) => handleChange(key, v)}
            />
          );
        }

        // Enum type (allOf with $ref)
        if (property.allOf && property.allOf.length > 0) {
          const enumKey = getEnumKey(property.allOf[0].$ref);
          const options =
            enumValues?.[enumKey] ?? DEFAULT_ENUM_VALUES[enumKey] ?? [];

          if (options.length > 0) {
            // Get the component schema type for proper type coercion
            const componentSchema = componentSchemas?.[enumKey];
            const enumType = componentSchema?.type;

            return (
              <EnumSelect
                key={key}
                propertyKey={key}
                property={property}
                value={value}
                options={options}
                onChange={(v) => {
                  // Convert string value to correct type based on component schema
                  if (enumType === 'integer') {
                    handleChange(key, Number.parseInt(v, 10));
                  } else if (enumType === 'number') {
                    handleChange(key, Number.parseFloat(v));
                  } else {
                    handleChange(key, v);
                  }
                }}
              />
            );
          }
        }

        // Direct enum type
        if (property.enum) {
          return (
            <EnumSelect
              key={key}
              propertyKey={key}
              property={property}
              value={value}
              options={property.enum}
              onChange={(v) => handleChange(key, v)}
            />
          );
        }

        // Boolean type
        if (property.type === 'boolean') {
          return (
            <CheckboxInput
              key={key}
              propertyKey={key}
              property={property}
              value={value}
              onChange={(v) => handleChange(key, v)}
            />
          );
        }

        // Integer/Number with min/max -> slider
        if (
          (property.type === 'integer' || property.type === 'number') &&
          property.minimum !== undefined &&
          property.maximum !== undefined
        ) {
          return (
            <SliderInput
              key={key}
              propertyKey={key}
              property={property}
              value={value}
              onChange={(v) => handleChange(key, v)}
            />
          );
        }

        // Integer/Number without min/max (like seed) -> simple input
        if (property.type === 'integer' || property.type === 'number') {
          return (
            <NumberInput
              key={key}
              propertyKey={key}
              property={property}
              value={value}
              onChange={(v) => handleChange(key, v)}
            />
          );
        }

        // Skip other types (strings that aren't connection fields are rare)
        return null;
      })}
    </div>
  );
}

export const SchemaInputs = memo(SchemaInputsComponent);

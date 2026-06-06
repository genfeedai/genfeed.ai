'use client';

import type { PresetElementSchema } from '@genfeedai/client/schemas';
import { ModelCategory } from '@genfeedai/enums';
import TextareaLabelActions from '@ui/content/textarea-label-actions/TextareaLabelActions';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import type { ChangeEvent } from 'react';
import type { Control } from 'react-hook-form';

type ModalPresetFieldsProps = {
  control: Control<PresetElementSchema>;
  watchedDescription: string | undefined;
  isSubmitting: boolean;
  isCopying: boolean;
  isEnhancing: boolean;
  previousPrompt: string | null;
  onChange: (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => void;
  onCopy: () => void;
  onEnhance: () => void;
  onUndo: () => void;
};

export default function ModalPresetFields({
  control,
  watchedDescription,
  isSubmitting,
  isCopying,
  isEnhancing,
  previousPrompt,
  onChange,
  onCopy,
  onEnhance,
  onUndo,
}: ModalPresetFieldsProps) {
  return (
    <>
      <FormControl label="Label">
        <Input
          type="text"
          name="label"
          control={control}
          onChange={onChange}
          placeholder="Enter display label"
          isRequired={true}
          isDisabled={isSubmitting}
        />
      </FormControl>

      <FormControl label="Key">
        <Input
          type="text"
          name="key"
          control={control}
          onChange={onChange}
          placeholder="lowercase-with-hyphens"
          isRequired={true}
          isDisabled={isSubmitting}
        />

        <p className="text-xs text-foreground/70 mt-1">
          Unique identifier (lowercase, alphanumeric with hyphens)
        </p>
      </FormControl>

      <FormControl label="Type">
        <SelectField
          name="category"
          control={control}
          onChange={onChange}
          isRequired={true}
          isDisabled={isSubmitting}
        >
          {Object.values(ModelCategory).map((elementType) => (
            <option
              key={elementType}
              value={elementType}
              className="capitalize"
            >
              {elementType}
            </option>
          ))}
        </SelectField>
      </FormControl>

      <FormControl
        label={
          <TextareaLabelActions
            label="Description"
            onCopy={onCopy}
            onEnhance={onEnhance}
            onUndo={onUndo}
            showUndo={!!previousPrompt}
            isCopyDisabled={!watchedDescription || isCopying || isSubmitting}
            isEnhanceDisabled={
              !watchedDescription || isEnhancing || isSubmitting
            }
            isEnhancing={isEnhancing}
          />
        }
      >
        <Textarea
          name="description"
          control={control}
          onChange={onChange}
          placeholder="Enter description (optional)"
          isDisabled={isSubmitting || isEnhancing}
        />
      </FormControl>
    </>
  );
}

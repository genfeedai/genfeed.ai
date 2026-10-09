'use client';

import { ModelCategory } from '@genfeedai/contracts';
import type { ModalPresetFieldsProps } from '@genfeedai/props/modals/modal.props';
import TextareaLabelActions from '@ui/content/textarea-label-actions/TextareaLabelActions';
import { Checkbox } from '@ui/primitives/checkbox';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';

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
      <FormControl label="Generation prompt">
        <Textarea
          name="prompt"
          control={control}
          onChange={onChange}
          isDisabled={isSubmitting}
          placeholder="Suggested prompt when the creator's prompt is empty"
        />
      </FormControl>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(
          [
            ['aspectRatio', 'Aspect ratio', '16:9'],
            ['promptTemplate', 'Prompt template', 'Template key'],
            ['style', 'Style', 'Visual style'],
            ['mood', 'Mood', 'Mood'],
            ['scene', 'Scene', 'Scene description'],
            ['camera', 'Camera', 'Camera angle'],
            ['lens', 'Lens', 'Lens'],
            ['lighting', 'Lighting', 'Lighting'],
            ['cameraMovement', 'Camera movement', 'Camera movement'],
          ] as const
        ).map(([name, label, placeholder]) => (
          <FormControl key={name} label={label}>
            <Input
              name={name}
              control={control}
              onChange={onChange}
              placeholder={placeholder}
              isDisabled={isSubmitting}
            />
          </FormControl>
        ))}
        <FormControl label="Video duration (seconds)">
          <Input
            type="number"
            min={0.01}
            max={3600}
            step="any"
            name="duration"
            control={control}
            onChange={onChange}
            isDisabled={isSubmitting}
          />
        </FormControl>
      </div>
      <Checkbox
        name="isActive"
        label="Active"
        control={control}
        isDisabled={isSubmitting}
      />
    </>
  );
}

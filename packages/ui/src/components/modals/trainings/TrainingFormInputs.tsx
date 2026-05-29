'use client';

import type { TrainingSchema } from '@genfeedai/client/schemas';
import { ButtonVariant, TrainingCategory } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import FormDropdown from '@ui/primitives/dropdown-field';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import type { DropzoneInputProps, DropzoneRootProps } from 'react-dropzone';
import type { Control, FieldErrors, UseFormWatch } from 'react-hook-form';
import {
  HiAdjustmentsHorizontal,
  HiArrowPath,
  HiPhoto,
  HiTag,
} from 'react-icons/hi2';

type TrainingFormInputsProps = {
  control: Control<TrainingSchema>;
  errors: FieldErrors<TrainingSchema>;
  watch: UseFormWatch<TrainingSchema>;
  isSubmitting: boolean;
  filesCount: number;
  maxFiles: number;
  maxSize: number;
  isDragActive: boolean;
  getRootProps: (props?: DropzoneRootProps) => DropzoneRootProps;
  getInputProps: (props?: DropzoneInputProps) => DropzoneInputProps;
  onGenerateRandomTrigger: () => void;
  onCategoryChange: (value: TrainingCategory) => void;
  onStepsChange: (value: number) => void;
};

export default function TrainingFormInputs({
  control,
  errors,
  watch,
  isSubmitting,
  filesCount,
  maxFiles,
  maxSize,
  isDragActive,
  getRootProps,
  getInputProps,
  onGenerateRandomTrigger,
  onCategoryChange,
  onStepsChange,
}: TrainingFormInputsProps) {
  return (
    <div className="space-y-4 mt-4">
      {/* First Row: Label + Description */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormControl label="Label" error={errors.label?.message} isRequired>
          <Input
            name="label"
            type="text"
            placeholder="e.g., My Character"
            control={control}
            className="h-10 border border-input px-3 w-full"
            isDisabled={isSubmitting}
          />
        </FormControl>

        <FormControl
          label="Description (optional)"
          error={errors.description?.message}
        >
          <Input
            name="description"
            type="text"
            placeholder="Brief description of the training"
            control={control}
            className="h-10 border border-input px-3 w-full"
            isDisabled={isSubmitting}
          />
        </FormControl>
      </div>

      {/* Second Row: Trigger Word */}
      <FormControl
        label="Trigger Word"
        error={errors.trigger?.message}
        isRequired
      >
        <div className="flex w-full">
          <Input
            name="trigger"
            type="text"
            placeholder="e.g., XQ7Z"
            control={control}
            className="h-10 border border-input px-3 flex-1"
            isDisabled={isSubmitting}
          />

          <Button
            icon={<HiArrowPath />}
            onClick={onGenerateRandomTrigger}
            isDisabled={isSubmitting}
            tooltip="Generate Random Trigger"
            tooltipPosition="left"
            variant={ButtonVariant.SECONDARY}
            className=" border-l-0"
          />
        </div>
      </FormControl>

      {/* Third Row: Category + Steps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormControl
          label="Category"
          isRequired
          error={errors.category?.message}
        >
          <FormDropdown
            name="category"
            icon={<HiTag className="size-4" />}
            label="Category"
            value={watch('category')}
            className="h-10 px-3 gap-2 text-sm flex-shrink-0 bg-secondary text-secondary-foreground"
            isDisabled={isSubmitting}
            options={[
              { key: TrainingCategory.SUBJECT, label: 'Subject' },
              { key: TrainingCategory.STYLE, label: 'Style' },
            ]}
            onChange={(e) => {
              onCategoryChange(e.target.value as TrainingCategory);
            }}
          />
        </FormControl>

        <FormControl
          label="Training Steps"
          error={errors.steps?.message}
          helpText="More steps = better quality, higher cost"
        >
          <FormDropdown
            name="steps"
            icon={<HiAdjustmentsHorizontal className="size-4" />}
            label="Steps"
            value={watch('steps')}
            className="h-10 px-3 gap-2 text-sm flex-shrink-0 bg-secondary text-secondary-foreground"
            isDisabled={isSubmitting}
            options={[
              { key: 1000, label: '1,000 (Low)' },
              { key: 2000, label: '2,000 (Medium)' },
              { key: 3000, label: '3,000 (Default)' },
              { key: 4000, label: '4,000 (High)' },
              { key: 5000, label: '5,000 (Best)' },
            ]}
            onChange={(e) => {
              onStepsChange(Number(e.target.value));
            }}
          />
        </FormControl>
      </div>

      {/* Dropzone */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">
          Training Images ({filesCount} / {maxFiles})
        </h4>

        <div
          {...getRootProps({
            className: `file-uploader !max-w-full bg-primary/10 border-primary/10 border-2 border-dashed p-4 text-center cursor-pointer transition-all ${
              isDragActive ? 'border-primary bg-primary/20' : ''
            }`,
          })}
        >
          <Input type="file" {...getInputProps({ name: 'file' })} />
          <div className="flex flex-col items-center gap-2">
            <HiPhoto className="text-4xl opacity-50" />
            {isDragActive ? (
              <p className="text-sm">Drop the images here…</p>
            ) : (
              <>
                <p className="text-sm font-medium">
                  Drop images here or click to upload
                </p>
                <p className="text-xs opacity-70">
                  Minimum 10 images required • Up to {maxFiles} files • Max{' '}
                  {maxSize}MB each
                </p>
                <p className="text-xs opacity-70">
                  Supported: JPG, JPEG, PNG, WEBP, GIF
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

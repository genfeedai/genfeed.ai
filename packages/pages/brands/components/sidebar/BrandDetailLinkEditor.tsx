'use client';

import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  LinkCategory,
} from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import Alert from '@ui/feedback/alert/Alert';
import FormControl from '@ui/forms/base/form-control/FormControl';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import type { ChangeEvent } from 'react';

export interface BrandLinkEditorValues {
  category: LinkCategory;
  label: string;
  url: string;
}

export interface BrandDetailLinkEditorProps {
  error: string | null;
  isEditing: boolean;
  isSubmitting: boolean;
  values: BrandLinkEditorValues;
  onCancel: () => void;
  onChange: (
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => void;
  onDelete: () => Promise<void>;
  onSubmit: () => Promise<void>;
}

export default function BrandDetailLinkEditor({
  error,
  isEditing,
  isSubmitting,
  values,
  onCancel,
  onChange,
  onDelete,
  onSubmit,
}: BrandDetailLinkEditorProps) {
  return (
    <div className="rounded-3xl border border-white/[0.08] bg-card/80 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.24)] backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.22em] text-foreground/45">
            External Link
          </p>
          <h3 className="text-lg font-semibold text-foreground">
            {isEditing ? 'Edit link' : 'Add link'}
          </h3>
        </div>
      </div>

      {error ? (
        <Alert type={AlertCategory.ERROR}>
          <div>{error}</div>
        </Alert>
      ) : null}

      <div className="mt-4 space-y-4">
        <FormControl label="Label">
          <Input
            type="text"
            name="label"
            value={values.label}
            onChange={onChange}
            placeholder="Enter link label"
            required
            disabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Category">
          <Select
            value={values.category}
            onValueChange={(value) => {
              onChange({
                target: { name: 'category', value },
              } as ChangeEvent<HTMLSelectElement>);
            }}
            disabled={isSubmitting}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(LinkCategory).map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormControl>

        <FormControl label="URL">
          <Input
            type="url"
            name="url"
            value={values.url}
            onChange={onChange}
            placeholder="https://genfeed.ai"
            required
            disabled={isSubmitting}
          />
        </FormControl>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          label="Cancel"
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          onClick={onCancel}
          isDisabled={isSubmitting}
        />

        {isEditing ? (
          <Button
            label="Delete"
            variant={ButtonVariant.DESTRUCTIVE}
            size={ButtonSize.SM}
            onClick={() => {
              void onDelete();
            }}
            isLoading={isSubmitting}
          />
        ) : null}

        <Button
          label={isEditing ? 'Save link' : 'Add link'}
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          onClick={() => {
            void onSubmit();
          }}
          isLoading={isSubmitting}
        />
      </div>
    </div>
  );
}

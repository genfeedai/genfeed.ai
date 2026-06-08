'use client';

import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import type { IFontFamily, IModel } from '@genfeedai/interfaces';
import Card from '@ui/card/Card';
import TextareaLabelActions from '@ui/content/textarea-label-actions/TextareaLabelActions';
import Alert from '@ui/feedback/alert/Alert';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import FormColorPicker from '@ui/primitives/color-picker';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { THEME_COLORS } from '@ui-constants/theme.constant';
import type { ChangeEvent, FormEvent } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type {
  BrandEditorTab,
  BrandFormValues,
  BrandOverlayRecord,
} from './ModalBrand.types';

export type BrandEditorFormProps = {
  activeBrand: BrandOverlayRecord | null;
  editorTab: BrandEditorTab;
  error: string | null;
  fontFamilies: IFontFamily[];
  form: UseFormReturn<BrandFormValues>;
  imageModels: IModel[];
  isGenerating: boolean;
  isSubmitting: boolean;
  musicModels: IModel[];
  onCancel: () => void;
  onChange: (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => void;
  onEnhanceDescription: () => Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onTabChange: (tab: BrandEditorTab) => void;
  onUndo: () => void;
  onCopyPrompt: () => Promise<void>;
  organizationDefaults: {
    defaultImageModel?: string | null;
    defaultImageToVideoModel?: string | null;
    defaultMusicModel?: string | null;
    defaultVideoModel?: string | null;
  };
  previousPrompt: string | null;
  videoModels: IModel[];
};

function getInheritedModelOptionLabel(
  value: string | null | undefined,
  models: IModel[],
): string {
  if (!value) {
    return 'Use organization default';
  }

  return `Use organization default (${models.find((model) => model.key === value)?.label ?? value})`;
}

export default function BrandEditorForm({
  activeBrand,
  editorTab,
  error,
  fontFamilies,
  form,
  imageModels,
  isGenerating,
  isSubmitting,
  musicModels,
  onCancel,
  onChange,
  onEnhanceDescription,
  onSubmit,
  onTabChange,
  onUndo,
  onCopyPrompt,
  organizationDefaults,
  previousPrompt,
  videoModels,
}: BrandEditorFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {error ? (
        <Alert type={AlertCategory.ERROR}>
          <div className="space-y-1">{error}</div>
        </Alert>
      ) : null}

      {hasFormErrors(form.formState.errors) ? (
        <Alert type={AlertCategory.ERROR}>
          <div className="space-y-1">
            {parseFormErrors(form.formState.errors).map((formError) => (
              <div key={formError}>{formError}</div>
            ))}
          </div>
        </Alert>
      ) : null}

      <Tabs
        tabs={[
          { id: 'info', label: 'Info' },
          { id: 'models', label: 'Models' },
          { id: 'branding', label: 'Branding' },
        ]}
        activeTab={editorTab}
        onTabChange={(id) => onTabChange(id as BrandEditorTab)}
      />

      <Card className="bg-card/80 backdrop-blur-sm" bodyClassName="p-5 sm:p-5">
        {editorTab === 'info' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormControl label="Label">
                <Input
                  type="text"
                  name="label"
                  control={form.control}
                  onChange={onChange}
                  placeholder="Enter brand name"
                  isRequired={true}
                  isDisabled={isSubmitting || isGenerating}
                />
              </FormControl>

              <FormControl label="Slug">
                <Input
                  type="text"
                  name="slug"
                  control={form.control}
                  onChange={onChange}
                  placeholder="Enter public slug"
                  isRequired={true}
                  isDisabled={isSubmitting || isGenerating}
                />
              </FormControl>
            </div>

            <FormControl label="Description">
              <Input
                type="text"
                name="description"
                control={form.control}
                onChange={onChange}
                placeholder="Describe the brand"
                isRequired={true}
                isDisabled={isSubmitting || isGenerating}
              />
            </FormControl>
          </div>
        ) : null}

        {editorTab === 'models' ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground/65">
              Leave a field empty to inherit the organization-level generation
              default for this brand.
            </p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormControl label="Default Video Model">
                <SelectField
                  name="defaultVideoModel"
                  control={form.control}
                  onChange={onChange}
                  isDisabled={isSubmitting || isGenerating}
                >
                  <option value="">
                    {getInheritedModelOptionLabel(
                      organizationDefaults.defaultVideoModel,
                      videoModels,
                    )}
                  </option>
                  {videoModels.map((model) => (
                    <option key={model.id} value={model.key}>
                      {model.label}
                    </option>
                  ))}
                </SelectField>
              </FormControl>

              <FormControl label="Default Image Model">
                <SelectField
                  name="defaultImageModel"
                  control={form.control}
                  onChange={onChange}
                  isDisabled={isSubmitting || isGenerating}
                >
                  <option value="">
                    {getInheritedModelOptionLabel(
                      organizationDefaults.defaultImageModel,
                      imageModels,
                    )}
                  </option>
                  {imageModels.map((model) => (
                    <option key={model.id} value={model.key}>
                      {model.label}
                    </option>
                  ))}
                </SelectField>
              </FormControl>

              <FormControl label="Default Image-to-Video Model">
                <SelectField
                  name="defaultImageToVideoModel"
                  control={form.control}
                  onChange={onChange}
                  isDisabled={isSubmitting || isGenerating}
                >
                  <option value="">
                    {getInheritedModelOptionLabel(
                      organizationDefaults.defaultImageToVideoModel,
                      videoModels,
                    )}
                  </option>
                  {videoModels.map((model) => (
                    <option key={model.id} value={model.key}>
                      {model.label}
                    </option>
                  ))}
                </SelectField>
              </FormControl>

              <FormControl label="Default Music Model">
                <SelectField
                  name="defaultMusicModel"
                  control={form.control}
                  onChange={onChange}
                  isDisabled={isSubmitting || isGenerating}
                >
                  <option value="">
                    {getInheritedModelOptionLabel(
                      organizationDefaults.defaultMusicModel,
                      musicModels,
                    )}
                  </option>
                  {musicModels.map((model) => (
                    <option key={model.id} value={model.key}>
                      {model.label}
                    </option>
                  ))}
                </SelectField>
              </FormControl>
            </div>
          </div>
        ) : null}

        {editorTab === 'branding' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FormControl label="Font Family" isRequired={true}>
                <SelectField
                  name="fontFamily"
                  control={form.control}
                  onChange={onChange}
                  isDisabled={isSubmitting || isGenerating}
                >
                  {fontFamilies.map((font) => (
                    <option key={font.key} value={font.key}>
                      {font.label}
                    </option>
                  ))}
                </SelectField>
              </FormControl>

              <FormColorPicker
                label="Primary Color"
                value={form.getValues('primaryColor') || THEME_COLORS.PRIMARY}
                isRequired={true}
                isDisabled={isSubmitting || isGenerating}
                onChange={(color) =>
                  form.setValue('primaryColor', color, {
                    shouldValidate: true,
                  })
                }
              />

              <FormColorPicker
                label="Secondary Color"
                value={
                  form.getValues('secondaryColor') || THEME_COLORS.SECONDARY
                }
                isRequired={true}
                isDisabled={isSubmitting || isGenerating}
                onChange={(color) =>
                  form.setValue('secondaryColor', color, {
                    shouldValidate: true,
                  })
                }
              />

              <FormColorPicker
                label="Background Color"
                value={form.getValues('backgroundColor') || '#FFFFFF'}
                isRequired={true}
                isDisabled={isSubmitting || isGenerating}
                position="right"
                onChange={(color) =>
                  form.setValue('backgroundColor', color, {
                    shouldValidate: true,
                  })
                }
              />
            </div>

            <FormControl
              label={
                <TextareaLabelActions
                  label="Brand System Prompt"
                  onCopy={onCopyPrompt}
                  onEnhance={onEnhanceDescription}
                  onUndo={onUndo}
                  showUndo={!!previousPrompt}
                  isCopyDisabled={!form.getValues('text')}
                  isEnhanceDisabled={
                    isSubmitting || isGenerating || !form.getValues('text')
                  }
                  isEnhancing={isSubmitting || isGenerating}
                  enhanceTooltip="Improve brand system prompt"
                />
              }
            >
              <Textarea
                name="text"
                control={form.control}
                onChange={onChange}
                placeholder="Enter the brand system prompt"
                className="w-full resize-none border border-input px-3 py-2"
                isDisabled={isSubmitting || isGenerating}
              />
            </FormControl>
          </div>
        ) : null}
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          label={activeBrand ? 'Back' : 'Cancel'}
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.LG}
          className="md:h-9 md:px-4 md:py-2"
          isLoading={isSubmitting}
          onClick={onCancel}
        />

        <Button
          type="submit"
          label={activeBrand ? 'Save changes' : 'Create brand'}
          variant={ButtonVariant.DEFAULT}
          isLoading={isSubmitting || isGenerating}
          isDisabled={isSubmitting || isGenerating || !form.formState.isValid}
        />
      </div>
    </form>
  );
}

'use client';

import { ModelCategory } from '@genfeedai/contracts';
import type { ModalPresetFieldsProps } from '@genfeedai/props/modals/modal.props';
import TextareaLabelActions from '@ui/content/textarea-label-actions/TextareaLabelActions';
import { Checkbox } from '@ui/primitives/checkbox';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('ui.presetFields');
  return (
    <>
      <FormControl label={t('label')}>
        <Input
          type="text"
          name="label"
          control={control}
          onChange={onChange}
          placeholder={t('labelPlaceholder')}
          isRequired={true}
          isDisabled={isSubmitting}
        />
      </FormControl>

      <FormControl label={t('key')}>
        <Input
          type="text"
          name="key"
          control={control}
          onChange={onChange}
          placeholder={t('keyPlaceholder')}
          isRequired={true}
          isDisabled={isSubmitting}
        />

        <p className="text-xs text-foreground/70 mt-1">{t('keyHelp')}</p>
      </FormControl>

      <FormControl label={t('type')}>
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
            label={t('description')}
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
          placeholder={t('descriptionPlaceholder')}
          isDisabled={isSubmitting || isEnhancing}
        />
      </FormControl>
      <FormControl label={t('prompt')}>
        <Textarea
          name="prompt"
          control={control}
          onChange={onChange}
          isDisabled={isSubmitting}
          placeholder={t('promptPlaceholder')}
        />
      </FormControl>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(
          [
            ['aspectRatio', t('aspectRatio'), t('aspectRatioPlaceholder')],
            [
              'promptTemplate',
              t('promptTemplate'),
              t('promptTemplatePlaceholder'),
            ],
            ['style', t('style'), t('stylePlaceholder')],
            ['mood', t('mood'), t('moodPlaceholder')],
            ['scene', t('scene'), t('scenePlaceholder')],
            ['camera', t('camera'), t('cameraPlaceholder')],
            ['lens', t('lens'), t('lensPlaceholder')],
            ['lighting', t('lighting'), t('lightingPlaceholder')],
            [
              'cameraMovement',
              t('cameraMovement'),
              t('cameraMovementPlaceholder'),
            ],
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
        <FormControl label={t('duration')}>
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
        label={t('active')}
        control={control}
        isDisabled={isSubmitting}
      />
    </>
  );
}

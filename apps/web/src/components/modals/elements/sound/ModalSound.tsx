'use client';

import {
  type SoundElementSchema,
  soundElementSchema,
} from '@genfeedai/client/schemas';
import { ButtonVariant, ModalEnum, ModelCategory } from '@genfeedai/contracts';
import type { ISound } from '@genfeedai/contracts/interfaces';
import type { ModalSoundProps } from '@genfeedai/props/modals/modal.props';
import { SoundsService } from '@genfeedai/services/elements/sounds.service';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import FormControl from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import type { ChangeEvent } from 'react';
import ElementPlatformFields from '@/components/modals/elements/shared/ElementPlatformFields';
import { useCrudModal } from '@/hooks/ui/use-crud-modal/use-crud-modal';

const WHITESPACE_RUNS_PATTERN = /\s+/g;
const NON_SLUG_CHARS_PATTERN = /[^a-z0-9-]/g;

export default function ModalSound({ onConfirm }: ModalSoundProps) {
  const t = useTranslations('ui.createModal');
  const { form, formRef, isSubmitting, onSubmit, closeModal } = useCrudModal<
    ISound,
    SoundElementSchema
  >({
    defaultValues: {
      description: '',
      isActive: true,
      key: '',
      sortOrder: 0,
      label: '',
    },
    entity: null,
    modalId: ModalEnum.SOUND,
    onConfirm,
    schema: soundElementSchema,
    serviceFactory: (token) => SoundsService.getInstance(token),
  });

  const updateModalSound = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    // Format key if key field changes
    if (name === 'key') {
      const formattedKey = value
        .toLowerCase()
        .replace(WHITESPACE_RUNS_PATTERN, '-')
        .replace(NON_SLUG_CHARS_PATTERN, '');
      form.setValue('key', formattedKey, { shouldValidate: true });
    } else {
      form.setValue(name as keyof SoundElementSchema, value, {
        shouldValidate: true,
      });
    }
  };

  return (
    <Modal id={ModalEnum.SOUND} title={t('sound')}>
      <Form ref={formRef} onSubmit={onSubmit}>
        <FormControl label="Label">
          <Input
            type="text"
            name="label"
            control={form.control}
            onChange={updateModalSound}
            placeholder="Enter display label"
            isRequired={true}
            isDisabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Key">
          <Input
            type="text"
            name="key"
            control={form.control}
            onChange={updateModalSound}
            placeholder="lowercase-with-hyphens"
            isRequired={true}
            isDisabled={isSubmitting}
          />

          <p className="text-xs text-foreground/70 mt-1">
            Unique identifier (lowercase, alphanumeric with hyphens)
          </p>
        </FormControl>

        <FormControl label="Type" helpText="Model type this sound applies to">
          <SelectField
            name="type"
            control={form.control}
            onChange={updateModalSound}
            isDisabled={isSubmitting}
            isRequired={true}
            placeholder="Select a type"
          >
            <option value={ModelCategory.VIDEO}>Video</option>
            <option value={ModelCategory.IMAGE}>Image</option>
            <option value={ModelCategory.TEXT}>Text/Voice</option>
            <option value={ModelCategory.MUSIC}>Music</option>
          </SelectField>
        </FormControl>

        <FormControl label="Description">
          <Input
            name="description"
            control={form.control}
            onChange={updateModalSound}
            placeholder="Enter description (optional)"
            isDisabled={isSubmitting}
          />
        </FormControl>

        <div className="flex flex-col gap-1.5">
          <Checkbox
            name="isActive"
            control={form.control}
            label="Automatically select this sound"
            isDisabled={isSubmitting}
          />
          <p className="text-xs text-foreground/70">
            When enabled, this sound will be pre-selected in the prompt bar
          </p>
        </div>

        <ElementPlatformFields
          isDisabled={isSubmitting}
          onSortOrderChange={(sortOrder) =>
            form.setValue('sortOrder', sortOrder, { shouldValidate: true })
          }
          sortOrder={form.watch('sortOrder') ?? 0}
        />

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={() => closeModal()}
            isLoading={isSubmitting}
          />

          <Button
            type="submit"
            label={t('create')}
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !form.formState.isValid}
          />
        </ModalActions>
      </Form>
    </Modal>
  );
}

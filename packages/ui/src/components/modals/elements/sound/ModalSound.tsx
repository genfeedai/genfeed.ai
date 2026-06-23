'use client';

import { soundElementSchema } from '@genfeedai/client/schemas';
import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { ButtonVariant, ModalEnum, ModelCategory } from '@genfeedai/enums';
import { useCrudModal } from '@genfeedai/hooks/ui/use-crud-modal/use-crud-modal';
import type { ISound } from '@genfeedai/interfaces';
import type { ModalSoundProps } from '@genfeedai/props/modals/modal.props';
import { SoundsService } from '@genfeedai/services/elements/sounds.service';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import type { ChangeEvent } from 'react';
import { HiTrash } from 'react-icons/hi2';

export default function ModalSound({ sound, onConfirm }: ModalSoundProps) {
  const { isSuperAdmin } = useAccessState();

  const {
    form,
    formRef,
    isSubmitting,
    onSubmit,
    closeModal,
    handleDelete: deleteModalSound,
  } = useCrudModal<
    ISound,
    any // SoundElementSchema - fix later
  >({
    defaultValues: {
      description: '',
      isActive: true,
      key: '',
      label: '',
    },
    entity: sound || null,
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
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      form.setValue('key', formattedKey, { shouldValidate: true });
    } else {
      form.setValue(name as any, value, { shouldValidate: true });
    }
  };

  return (
    <Modal id={ModalEnum.SOUND} title={sound ? 'Update Sound' : 'Create Sound'}>
      <form ref={formRef} onSubmit={onSubmit}>
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
            isDisabled={isSubmitting || (!!sound && !isSuperAdmin)}
          />

          <p className="text-xs text-foreground/70 mt-1">
            Unique identifier (lowercase, alphanumeric with hyphens)
            {sound && !isSuperAdmin && (
              <span className="text-warning">
                {' '}
                (Key editing requires superadmin privileges)
              </span>
            )}
          </p>
        </FormControl>

        <FormControl label="Type">
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
          <p className="text-xs text-foreground/70 mt-1">
            Model type this sound applies to
          </p>
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

        <Checkbox
          name="isSelected"
          control={form.control}
          label="Automatically select this sound"
          isChecked={form.watch('isSelected')}
          onChange={(e) => {
            form.setValue('isSelected', e.target.checked, {
              shouldValidate: true,
            });
          }}
          isDisabled={isSubmitting}
        />
        <p className="text-xs text-foreground/70 mt-1">
          When enabled, this sound will be pre-selected in the prompt bar
        </p>

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={() => closeModal()}
            isLoading={isSubmitting}
          />

          {sound && deleteModalSound && (
            <Button
              label={<HiTrash />}
              variant={ButtonVariant.DESTRUCTIVE}
              onClick={deleteModalSound}
              isLoading={isSubmitting}
            />
          )}

          <Button
            type="submit"
            label={sound ? 'Update' : 'Create'}
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !form.formState.isValid}
          />
        </ModalActions>
      </form>
    </Modal>
  );
}

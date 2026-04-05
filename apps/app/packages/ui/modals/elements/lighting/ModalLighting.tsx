import type { IElementLighting } from '@genfeedai/interfaces';
import {
  type ElementSimpleSchema,
  elementSimpleSchema,
} from '@genfeedai/client/schemas';
import { ButtonVariant, ModalEnum } from '@genfeedai/enums';
import { useCrudModal } from '@hooks/ui/use-crud-modal/use-crud-modal';
import type { ModalCrudProps } from '@props/modals/modal.props';
import { LightingsService } from '@services/elements/lightings.service';
import Button from '@ui/buttons/base/Button';
import FormControl from '@ui/forms/base/form-control/FormControl';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import type { ChangeEvent } from 'react';

export default function ModalLighting({
  item,
  onConfirm,
  onClose,
}: ModalCrudProps<IElementLighting>) {
  const { form, formRef, isSubmitting, onSubmit, closeModal } = useCrudModal<
    IElementLighting,
    ElementSimpleSchema
  >({
    defaultValues: {
      description: '',
      key: '',
      label: '',
    },
    entity: item || null,
    modalId: ModalEnum.LIGHTING,
    onClose,
    onConfirm,
    schema: elementSimpleSchema,
    serviceFactory: (token) => LightingsService.getInstance(token),
  });

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
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
    <Modal
      id={ModalEnum.LIGHTING}
      title={item ? 'Edit Lighting' : 'Create Lighting'}
    >
      <form ref={formRef} onSubmit={onSubmit}>
        <FormControl label="Label">
          <FormInput
            type="text"
            name="label"
            control={form.control}
            onChange={handleChange}
            placeholder="Enter display label"
            isRequired={true}
            isDisabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Key">
          <FormInput
            type="text"
            name="key"
            control={form.control}
            onChange={handleChange}
            placeholder="lowercase-with-hyphens"
            isRequired={true}
            isDisabled={isSubmitting}
          />
          <p className="text-xs text-foreground/70 mt-1">
            Unique identifier (lowercase, alphanumeric with hyphens)
          </p>
        </FormControl>

        <FormControl label="Description">
          <FormInput
            name="description"
            control={form.control}
            onChange={handleChange}
            placeholder="Enter description (optional)"
            isDisabled={isSubmitting}
          />
        </FormControl>

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={() => closeModal()}
            isLoading={isSubmitting}
          />

          <Button
            type="submit"
            label={item ? 'Update' : 'Create'}
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !form.formState.isValid}
          />
        </ModalActions>
      </form>
    </Modal>
  );
}

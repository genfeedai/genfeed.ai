import {
  type ElementSimpleSchema,
  elementSimpleSchema,
} from '@genfeedai/client/schemas';
import { ButtonVariant, ModalEnum } from '@genfeedai/enums';
import { useCrudModal } from '@genfeedai/hooks/ui/use-crud-modal/use-crud-modal';
import type { IElementLens } from '@genfeedai/interfaces';
import type { ModalCrudProps } from '@genfeedai/props/modals/modal.props';
import { LensesService } from '@genfeedai/services/elements/lenses.service';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import type { ChangeEvent } from 'react';

export default function ModalLens({
  item,
  onConfirm,
  onClose,
}: ModalCrudProps<IElementLens>) {
  const { form, formRef, isSubmitting, onSubmit, closeModal } = useCrudModal<
    IElementLens,
    ElementSimpleSchema
  >({
    defaultValues: {
      description: '',
      key: '',
      label: '',
    },
    entity: item || null,
    modalId: ModalEnum.LENS,
    onClose,
    onConfirm,
    schema: elementSimpleSchema,
    serviceFactory: (token) => LensesService.getInstance(token),
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
    <Modal id={ModalEnum.LENS} title={item ? 'Edit Lens' : 'Create Lens'}>
      <form ref={formRef} onSubmit={onSubmit}>
        <FormControl label="Label">
          <Input
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
          <Input
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
          <Input
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

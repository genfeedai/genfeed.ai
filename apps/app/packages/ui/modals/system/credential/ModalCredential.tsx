import type { ICredential } from '@genfeedai/interfaces';
import {
  type CredentialSchema,
  credentialSchema,
} from '@genfeedai/client/schemas';
import { AlertCategory, ButtonVariant, ModalEnum } from '@genfeedai/enums';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { useCrudModal } from '@hooks/ui/use-crud-modal/use-crud-modal';
import { useModalAutoOpen } from '@hooks/ui/use-modal-auto-open/use-modal-auto-open';
import type { ModalCredentialProps } from '@props/modals/modal.props';
import { CredentialsService } from '@services/organization/credentials.service';
import Button from '@ui/buttons/base/Button';
import Alert from '@ui/feedback/alert/Alert';
import FormControl from '@ui/forms/base/form-control/FormControl';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import FormTextarea from '@ui/forms/inputs/textarea/form-textarea/FormTextarea';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { type ChangeEvent, useEffect } from 'react';
import { HiTrash } from 'react-icons/hi2';

export default function ModalCredential({
  credential,
  onConfirm,
  isOpen,
  openKey,
}: ModalCredentialProps) {
  const { form, formRef, isSubmitting, onSubmit, closeModal, handleDelete } =
    useCrudModal<ICredential, CredentialSchema>({
      defaultValues: {
        description: '',
        label: '',
      },
      entity: credential || null,
      modalId: ModalEnum.CREDENTIAL,
      onConfirm,
      schema: credentialSchema,
      serviceFactory: (token) => CredentialsService.getInstance(token),
    });

  const shouldAutoOpen = isOpen ?? Boolean(credential);
  useModalAutoOpen(ModalEnum.CREDENTIAL, {
    isOpen: shouldAutoOpen,
    openKey,
  });

  // Populate form when editing
  useEffect(() => {
    if (credential) {
      form.setValue('label', credential.label);
      form.setValue('description', credential.description);
    }
  }, [credential, form]);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    form.setValue(name as any, value, { shouldValidate: true });
  };

  return (
    <Modal
      id={ModalEnum.CREDENTIAL}
      title={credential ? 'Edit Credential' : 'Create Credential'}
    >
      <form ref={formRef} onSubmit={onSubmit}>
        {hasFormErrors(form.formState.errors) && (
          <Alert type={AlertCategory.ERROR} className="mb-4">
            <div className="space-y-1">
              {parseFormErrors(form.formState.errors).map((error, index) => (
                <div key={index}>{error}</div>
              ))}
            </div>
          </Alert>
        )}

        <FormControl label="Label">
          <FormInput
            type="text"
            name="label"
            control={form.control}
            onChange={handleChange}
            placeholder="Enter credential label"
            isRequired={true}
            isDisabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Description">
          <FormTextarea
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

          {credential && handleDelete && (
            <Button
              label={<HiTrash />}
              variant={ButtonVariant.DESTRUCTIVE}
              onClick={handleDelete}
              isLoading={isSubmitting}
            />
          )}

          <Button
            type="submit"
            label={credential ? 'Update' : 'Create'}
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !form.formState.isValid}
          />
        </ModalActions>
      </form>
    </Modal>
  );
}

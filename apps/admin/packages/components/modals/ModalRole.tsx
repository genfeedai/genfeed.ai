import type { IRole } from '@genfeedai/interfaces';
import FormControl from '@components/forms/base/form-control/FormControl';
import ModalActions from '@components/modals/actions/ModalActions';
import Modal from '@components/modals/modal/Modal';
import { type RoleSchema, roleSchema } from '@genfeedai/client/schemas';
import { AlertCategory, ButtonVariant, ModalEnum } from '@genfeedai/enums';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { useCrudModal } from '@hooks/ui/use-crud-modal/use-crud-modal';
import type { ModalRoleProps } from '@props/modals/modal.props';
import { RolesService } from '@services/organization/roles.service';
import Alert from '@ui/feedback/alert/Alert';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { type ChangeEvent, useEffect } from 'react';
import { HiTrash } from 'react-icons/hi2';

export default function ModalRole({ role, onConfirm }: ModalRoleProps) {
  const { form, formRef, isSubmitting, onSubmit, closeModal, handleDelete } =
    useCrudModal<IRole, RoleSchema>({
      defaultValues: {
        key: '',
        label: '',
        primaryColor: '',
      },
      entity: role || null,
      modalId: ModalEnum.ROLE,
      onConfirm,
      schema: roleSchema,
      serviceFactory: (token: string) => RolesService.getInstance(token),
    });

  useEffect(() => {
    if (role) {
      form.setValue('label', role.label, { shouldValidate: true });
      form.setValue('key', role.key, { shouldValidate: true });
      form.setValue('primaryColor', role.primaryColor, {
        shouldValidate: true,
      });
    }
  }, [role, form]);

  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    const { name, value } = e.target;

    if (name === 'key') {
      const formattedKey = value
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      form.setValue('key', formattedKey, { shouldValidate: true });
      return;
    }

    form.setValue(name as keyof RoleSchema, value, { shouldValidate: true });
  }

  return (
    <Modal
      id={ModalEnum.ROLE}
      title={role ? 'Edit Role' : 'Create Role'}
      onClose={() => closeModal(false)}
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
          <Input
            type="text"
            {...form.register('label')}
            name="label"
            onChange={handleChange}
            placeholder="Enter display label"
            required
            disabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Key">
          <Input
            type="text"
            {...form.register('key')}
            name="key"
            onChange={handleChange}
            placeholder="lowercase-with-hyphens"
            required
            disabled={isSubmitting}
          />
          <p className="text-xs text-foreground/70 mt-1">
            Unique identifier (lowercase, alphanumeric with hyphens)
          </p>
        </FormControl>

        <FormControl label="Primary Color">
          <Input
            type="text"
            {...form.register('primaryColor')}
            name="primaryColor"
            onChange={handleChange}
            placeholder="#000000 or color name"
            required
            disabled={isSubmitting}
          />
          <p className="text-xs text-foreground/70 mt-1">
            Hex color code or color name for role badge
          </p>
        </FormControl>

        <ModalActions>
          <Button
            variant={ButtonVariant.SECONDARY}
            type="button"
            onClick={() => closeModal()}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Spinner /> : null}
            Cancel
          </Button>

          {role && handleDelete && (
            <Button
              variant={ButtonVariant.DESTRUCTIVE}
              type="button"
              onClick={handleDelete}
              disabled={isSubmitting}
              aria-label="Delete role"
            >
              {isSubmitting ? <Spinner /> : <HiTrash />}
            </Button>
          )}

          <Button
            type="submit"
            variant={ButtonVariant.DEFAULT}
            disabled={isSubmitting || !form.formState.isValid}
          >
            {isSubmitting ? <Spinner /> : null}
            {role ? 'Update' : 'Create'}
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}

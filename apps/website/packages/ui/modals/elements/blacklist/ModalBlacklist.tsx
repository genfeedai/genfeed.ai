import { useUser } from '@clerk/nextjs';
import {
  type ElementBlacklistSchema,
  elementBlacklistSchema,
} from '@genfeedai/client/schemas';
import {
  AlertCategory,
  ButtonVariant,
  ModalEnum,
  ModelCategory,
} from '@genfeedai/enums';
import { getClerkPublicData } from '@helpers/auth/clerk.helper';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { useCrudModal } from '@hooks/ui/use-crud-modal/use-crud-modal';
import type { ElementBlacklist } from '@models/elements/blacklist.model';
import type { ModalBlacklistProps } from '@props/modals/modal.props';
import { BlacklistsService } from '@services/elements/blacklists.service';
import Button from '@ui/buttons/base/Button';
import Alert from '@ui/feedback/alert/Alert';
import FormControl from '@ui/forms/base/form-control/FormControl';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import FormCheckbox from '@ui/forms/selectors/checkbox/form-checkbox/FormCheckbox';
import FormSelect from '@ui/forms/selectors/select/form-select/FormSelect';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import type { ChangeEvent } from 'react';

export default function ModalBlacklist({
  item,
  onConfirm,
  onClose,
}: ModalBlacklistProps) {
  const { user } = useUser();
  const isSuperAdmin = user ? getClerkPublicData(user).isSuperAdmin : false;

  const { form, formRef, isSubmitting, onSubmit, closeModal } = useCrudModal<
    ElementBlacklist,
    ElementBlacklistSchema
  >({
    defaultValues: {
      category: ModelCategory.VIDEO,
      description: '',
      isActive: true,
      isDefault: false,
      key: '',
      label: '',
    },
    entity: item || null,
    modalId: ModalEnum.BLACKLIST,
    onClose,
    onConfirm,
    schema: elementBlacklistSchema,
    serviceFactory: (token) => BlacklistsService.getInstance(token),
  });

  const handleChange = (
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
    <Modal
      id={ModalEnum.BLACKLIST}
      title={item ? 'Edit Blacklist' : 'Create Blacklist'}
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
            isDisabled={isSubmitting || (!!item && !isSuperAdmin)}
          />

          <p className="text-xs text-foreground/70 mt-1">
            Unique identifier (lowercase, alphanumeric with hyphens)
            {item && !isSuperAdmin && (
              <span className="text-warning">
                {' '}
                (Key editing requires superadmin privileges)
              </span>
            )}
          </p>
        </FormControl>

        <FormControl label="Type">
          <FormSelect
            name="category"
            control={form.control}
            onChange={handleChange}
            isDisabled={isSubmitting}
            isRequired={true}
            placeholder="Select a type"
          >
            <option value={ModelCategory.VIDEO}>Video</option>
            <option value={ModelCategory.IMAGE}>Image</option>
            <option value={ModelCategory.TEXT}>Text/Voice</option>
            <option value={ModelCategory.MUSIC}>Music</option>
          </FormSelect>

          <p className="text-xs text-foreground/70 mt-1">
            Model category this blacklist applies to
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

        <FormCheckbox
          name="isDefault"
          control={form.control}
          label="Automatically select this blacklist item"
          isChecked={form.watch('isDefault')}
          onChange={(e) => {
            form.setValue('isDefault', e.target.checked, {
              shouldValidate: true,
            });
          }}
          isDisabled={isSubmitting}
        />
        <p className="text-xs text-foreground/70 mt-1">
          When enabled, this blacklist item will be pre-selected in the prompt
          bar
        </p>

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

import { type FolderSchema, folderSchema } from '@genfeedai/client/schemas';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { AlertCategory, ButtonVariant, ModalEnum } from '@genfeedai/enums';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import { useCrudModal } from '@genfeedai/hooks/ui/use-crud-modal/use-crud-modal';
import type { IBrand, IFolder } from '@genfeedai/interfaces';
import type { ModalFolderProps } from '@genfeedai/props/modals/modal.props';
import { FoldersService } from '@genfeedai/services/content/folders.service';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { type ChangeEvent, useEffect } from 'react';

export default function ModalFolder({
  item,
  onConfirm,
  brandId: propBrandId,
}: ModalFolderProps) {
  const { brands } = useBrand();
  const isManagerApp = EnvironmentService.currentApp === 'app';

  const { form, formRef, isSubmitting, onSubmit, closeModal } = useCrudModal<
    IFolder,
    FolderSchema
  >({
    defaultValues: {
      brand: '',
      description: '',
      label: '',
      tags: [],
    },
    entity: item || null,
    modalId: ModalEnum.FOLDER,
    onConfirm: (isRefreshing) => {
      onConfirm(isRefreshing);
    },
    schema: folderSchema,
    serviceFactory: (token) => FoldersService.getInstance(token),
    transformSubmitData: (formData) => ({
      ...formData,
      brand: formData.brand,
    }),
  });

  // Ensure brand field stores the brand id (not the entire brand object)
  useEffect(() => {
    if (item) {
      form.setValue('label', item.label, { shouldValidate: true });
      form.setValue('description', item.description, {
        shouldValidate: true,
      });
      form.setValue('tags', item.tags || [], { shouldValidate: true });
      form.setValue('brand', item.brand?.id, { shouldValidate: true });
    } else {
      // Set default brand if provided via props
      if (propBrandId) {
        form.setValue('brand', propBrandId, { shouldValidate: true });
      }
    }
  }, [item, form, propBrandId]);

  const processKeyDownModalFolder = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!isSubmitting && form.formState.isValid) {
        onSubmit(e as unknown as Parameters<typeof onSubmit>[0]);
      }
    }
  };

  const updateModalFolder = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    form.setValue(name as keyof FolderSchema, value, { shouldValidate: true });
  };

  const cancelModalFolder = () => {
    closeModal();
  };

  return (
    <Modal id={ModalEnum.FOLDER} title={item ? 'Edit Folder' : 'Create Folder'}>
      <form ref={formRef} onSubmit={onSubmit}>
        {hasFormErrors(form.formState.errors) && (
          <Alert type={AlertCategory.ERROR} className="mb-4">
            <div className="space-y-1">
              {parseFormErrors(form.formState.errors).map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          </Alert>
        )}

        <FormControl label="Label">
          <Input
            type="text"
            name="label"
            control={form.control}
            onChange={updateModalFolder}
            placeholder="Enter folder name"
            isRequired={true}
            isDisabled={isSubmitting}
          />
        </FormControl>
        <FormControl label="Description">
          <Textarea
            name="description"
            control={form.control}
            onChange={updateModalFolder}
            placeholder="Enter description (optional)"
            isDisabled={isSubmitting}
            onKeyDown={processKeyDownModalFolder}
          />
        </FormControl>

        {brands.length > 0 && !isManagerApp && (
          <FormControl label="Brand (Optional)">
            <SelectField
              name="brand"
              control={form.control}
              onChange={updateModalFolder}
              isDisabled={isSubmitting}
            >
              <option value="">None</option>
              {brands.map((brand: IBrand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.label}
                </option>
              ))}
            </SelectField>
          </FormControl>
        )}
        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={cancelModalFolder}
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

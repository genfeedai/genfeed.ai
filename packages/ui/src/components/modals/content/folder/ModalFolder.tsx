import { type FolderSchema, folderSchema } from '@genfeedai/client/schemas';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  AlertCategory,
  ButtonVariant,
  ModalEnum,
  PageScope,
} from '@genfeedai/contracts';
import type { IBrand, IFolder } from '@genfeedai/contracts/interfaces';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import { useCrudModal } from '@genfeedai/hooks/ui/use-crud-modal/use-crud-modal';
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
import { type ChangeEvent, useCallback, useEffect, useMemo } from 'react';

function buildFolderDefaultValues(
  propBrandId: string | undefined,
  scope: PageScope,
): FolderSchema {
  return {
    brandId: scope === PageScope.BRAND && propBrandId ? propBrandId : '',
    description: '',
    label: '',
    tags: [],
  };
}

export default function ModalFolder({
  item,
  onConfirm,
  brandId: propBrandId,
  scope = PageScope.BRAND,
}: ModalFolderProps) {
  const { brands } = useBrand();
  const isManagerApp = EnvironmentService.currentApp === 'app';

  const defaultValues = useMemo(
    () => buildFolderDefaultValues(propBrandId, scope),
    [propBrandId, scope],
  );

  const { form, formRef, isSubmitting, onSubmit, closeModal } = useCrudModal<
    IFolder,
    FolderSchema
  >({
    defaultValues,
    entity: item || null,
    modalId: ModalEnum.FOLDER,
    onConfirm: (isRefreshing) => {
      onConfirm(isRefreshing);
    },
    schema: folderSchema,
    serviceFactory: (token) => FoldersService.getInstance(token),
    // Empty tags arrays are not a Prisma M2M write — drop them so create/update
    // does not send `tags: []` and 500.
    transformSubmitData: (formData) => {
      const { tags, ...rest } = formData;
      if (!Array.isArray(tags) || tags.length === 0) {
        return rest;
      }
      return formData;
    },
  });

  // Ensure brand field stores the brand id (not the entire brand object)
  useEffect(() => {
    if (item) {
      form.setValue('label', item.label, { shouldValidate: true });
      form.setValue('description', item.description, {
        shouldValidate: true,
      });
      form.setValue('tags', item.tags || [], { shouldValidate: true });
      form.setValue('brandId', item.brand?.id, { shouldValidate: true });
    } else {
      // Set default brand if provided via props
      if (scope === PageScope.BRAND && propBrandId) {
        form.setValue('brandId', propBrandId, { shouldValidate: true });
      }
    }
  }, [item, form, propBrandId, scope]);

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

  // Cancel, backdrop, and the header X all land here so the form never keeps
  // stale label/description values for the next open.
  const handleModalClose = useCallback(() => {
    closeModal();
  }, [closeModal]);

  return (
    <Modal
      id={ModalEnum.FOLDER}
      title={item ? 'Edit Folder' : 'Create Folder'}
      onClose={handleModalClose}
    >
      <form ref={formRef} className="flex flex-col gap-4" onSubmit={onSubmit}>
        {hasFormErrors(form.formState.errors) && (
          <Alert type={AlertCategory.ERROR}>
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
            rows={3}
          />
        </FormControl>

        {brands.length > 0 && !isManagerApp && (
          <FormControl label="Brand (Optional)">
            <SelectField
              name="brandId"
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
            onClick={handleModalClose}
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

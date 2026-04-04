import type { IBrand, IFolder } from '@genfeedai/interfaces';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { type FolderSchema, folderSchema } from '@genfeedai/client/schemas';
import { AlertCategory, ButtonVariant, ModalEnum } from '@genfeedai/enums';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { useCrudModal } from '@hooks/ui/use-crud-modal/use-crud-modal';
import { Folder } from '@models/content/folder.model';
import type { ModalFolderProps } from '@props/modals/modal.props';
import { FoldersService } from '@services/content/folders.service';
import { EnvironmentService } from '@services/core/environment.service';
import Button from '@ui/buttons/base/Button';
import Alert from '@ui/feedback/alert/Alert';
import FormControl from '@ui/forms/base/form-control/FormControl';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import FormTextarea from '@ui/forms/inputs/textarea/form-textarea/FormTextarea';
import FormSelect from '@ui/forms/selectors/select/form-select/FormSelect';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
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
    transformSubmitData: (formData) =>
      new Folder({
        ...formData,
        brand: formData.brand as any, // API accepts brand ID as string
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!isSubmitting && form.formState.isValid) {
        onSubmit(e as any);
      }
    }
  };

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    form.setValue(name as keyof FolderSchema, value, { shouldValidate: true });
  };

  const handleCancel = () => {
    closeModal();
  };

  return (
    <Modal id={ModalEnum.FOLDER} title={item ? 'Edit Folder' : 'Create Folder'}>
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
            placeholder="Enter folder name"
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
            onKeyDown={handleKeyDown}
          />
        </FormControl>

        {brands.length > 0 && !isManagerApp && (
          <FormControl label="Brand (Optional)">
            <FormSelect
              name="brand"
              control={form.control}
              onChange={handleChange}
              isDisabled={isSubmitting}
            >
              <option value="">None</option>
              {brands.map((brand: IBrand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.label}
                </option>
              ))}
            </FormSelect>
          </FormControl>
        )}
        {/* <FormControl label="Tags">
          <div className="space-y-2">
            <div className="flex gap-2">
              <FormInput
                type="text"
                name="tags"
                control={form.control}
                onChange={handleChange}
                placeholder="Enter tag and press Enter"
                isDisabled={isSubmitting}
              />

              <Button
                label={<HiPlus />}
                variant="default"
                onClick={handleAddTag}
                isDisabled={isSubmitting || !tagInput.trim()}
              />
            </div>

            {form.watch('tags') && form.watch('tags').length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {form.watch('tags').map((tag, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground"
                  >
                    {tag}
                    <Button
                      withWrapper={false}
                      variant="unstyled"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-error"
                      isDisabled={isSubmitting}
                      ariaLabel={`Remove ${tag}`}
                    >
                      <HiXMark className="text-xs" />
                    </Button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </FormControl> */}
        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={handleCancel}
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

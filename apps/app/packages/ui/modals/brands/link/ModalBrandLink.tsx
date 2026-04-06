import { type LinkSchema, linkSchema } from '@genfeedai/client/schemas';
import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  LinkCategory,
  ModalEnum,
} from '@genfeedai/enums';
import type { ILink } from '@genfeedai/interfaces';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { useCrudModal } from '@hooks/ui/use-crud-modal/use-crud-modal';
import type { ModalBrandLinkProps } from '@props/modals/modal.props';
import { LinksService } from '@services/social/links.service';
import Button from '@ui/buttons/base/Button';
import Alert from '@ui/feedback/alert/Alert';
import FormControl from '@ui/forms/base/form-control/FormControl';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import FormSelect from '@ui/forms/selectors/select/form-select/FormSelect';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { type ChangeEvent, useEffect, useState } from 'react';

export default function ModalBrandLink({
  brandId,
  link,
  onConfirm,
}: ModalBrandLinkProps) {
  const [validationError, setValidationError] = useState<string | null>(null);

  const { form, formRef, isSubmitting, onSubmit, closeModal, handleDelete } =
    useCrudModal<ILink, LinkSchema>({
      defaultValues: {
        brand: brandId ?? '',
        category: LinkCategory.WEBSITE,
        label: '',
        url: '',
      },
      entity: link || null,
      modalId: ModalEnum.BRAND_LINK,
      onConfirm,
      schema: linkSchema,
      serviceFactory: (token) => LinksService.getInstance(token),
      transformSubmitData: (formData) => {
        // For POST operations, ensure brandId is included
        if (!link && brandId) {
          return { ...formData, brand: brandId };
        }
        return formData;
      },
    });

  // Populate form when editing
  useEffect(() => {
    if (link) {
      form.setValue('brand', brandId ?? '', { shouldValidate: true });
      form.setValue('label', link.label, { shouldValidate: true });
      form.setValue('category', link.category || LinkCategory.WEBSITE, {
        shouldValidate: true,
      });
      form.setValue('url', link.url, { shouldValidate: true });
    }
  }, [link, brandId, form]);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    form.setValue(name as any, value, { shouldValidate: true });
  };

  return (
    <Modal
      id={ModalEnum.BRAND_LINK}
      title={link ? 'Edit Link' : 'Add Link'}
      error={validationError}
      onClose={() => setValidationError(null)}
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
            placeholder="Enter link label"
            isRequired={true}
            isDisabled={isSubmitting}
          />
        </FormControl>

        <div className="grid grid-cols-1 gap-4 mb-4">
          <FormSelect
            name="category"
            control={form.control}
            onChange={handleChange}
            isDisabled={isSubmitting}
          >
            {Object.values(LinkCategory).map(
              (category: LinkCategory, index: number) => (
                <option key={index} value={category}>
                  {category}
                </option>
              ),
            )}
          </FormSelect>
        </div>

        <FormControl label="URL">
          <FormInput
            type="url"
            name="url"
            control={form.control}
            onChange={handleChange}
            placeholder="https://genfeed.ai"
            isRequired={true}
            isDisabled={isSubmitting}
          />
        </FormControl>

        <ModalActions className="mt-6">
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.LG}
            className="md:h-9 md:px-4 md:py-2 mb-4 md:mb-0"
            isLoading={isSubmitting}
            onClick={() => closeModal()}
          />

          {link && handleDelete && (
            <Button
              label="Delete"
              variant={ButtonVariant.DESTRUCTIVE}
              size={ButtonSize.LG}
              className="md:h-9 md:px-4 md:py-2 mb-4 md:mb-0"
              onClick={handleDelete}
              isLoading={isSubmitting}
            />
          )}

          <Button
            type="submit"
            label={link ? 'Update' : 'Add'}
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !form.formState.isValid}
          />
        </ModalActions>
      </form>
    </Modal>
  );
}

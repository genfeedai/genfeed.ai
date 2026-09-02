import { type LinkSchema, linkSchema } from '@genfeedai/client/schemas';
import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  LinkCategory,
  ModalEnum,
} from '@genfeedai/contracts';
import type { ILink } from '@genfeedai/contracts/interfaces';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import { useCrudModal } from '@genfeedai/hooks/ui/use-crud-modal/use-crud-modal';
import type { ModalBrandLinkProps } from '@genfeedai/props/modals/modal.props';
import { LinksService } from '@genfeedai/services/social/links.service';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { type ChangeEvent, useEffect, useState } from 'react';

/**
 * Manual brand links are non-OAuth destinations only.
 * Social profiles (X, IG, YouTube, …) come from connected accounts on
 * /settings/social — not free-typed Link rows.
 */
const LINK_CATEGORY_OPTIONS: Array<{ label: string; value: LinkCategory }> = [
  { label: 'Website', value: LinkCategory.WEBSITE },
  { label: 'Other', value: LinkCategory.OTHER },
];

export default function ModalBrandLink({
  brandId,
  link,
  onConfirm,
}: ModalBrandLinkProps) {
  const [validationError, setValidationError] = useState<string | null>(null);

  const {
    form,
    formRef,
    isSubmitting,
    onSubmit,
    closeModal,
    handleDelete: deleteModalBrandLink,
  } = useCrudModal<ILink, LinkSchema>({
    defaultValues: {
      brandId: brandId ?? '',
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
      if (!link && brandId) {
        return { ...formData, brandId };
      }
      return formData;
    },
  });

  useEffect(() => {
    if (link) {
      const category =
        link.category === LinkCategory.OTHER
          ? LinkCategory.OTHER
          : LinkCategory.WEBSITE;
      form.setValue('brandId', brandId ?? '', { shouldValidate: true });
      form.setValue('label', link.label, { shouldValidate: true });
      form.setValue('category', category, { shouldValidate: true });
      form.setValue('url', link.url, { shouldValidate: true });
    }
  }, [link, brandId, form]);

  const updateModalBrandLink = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    form.setValue(name as Parameters<typeof form.setValue>[0], value, {
      shouldValidate: true,
    });
  };

  return (
    <Modal
      id={ModalEnum.BRAND_LINK}
      title={link ? 'Edit Link' : 'Add Link'}
      error={validationError}
      onClose={() => setValidationError(null)}
    >
      <form ref={formRef} className="flex flex-col gap-4" onSubmit={onSubmit}>
        {hasFormErrors(form.formState.errors) ? (
          <Alert type={AlertCategory.ERROR}>
            <div className="space-y-1">
              {parseFormErrors(form.formState.errors).map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          </Alert>
        ) : null}

        <FormControl label="Category">
          <SelectField
            name="category"
            control={form.control}
            onChange={updateModalBrandLink}
            isRequired={true}
            isDisabled={isSubmitting}
            placeholder="Select a category"
          >
            {LINK_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </FormControl>

        <FormControl label="Label">
          <Input
            type="text"
            name="label"
            control={form.control}
            onChange={updateModalBrandLink}
            placeholder="Homepage, Docs, Blog…"
            isRequired={true}
            isDisabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="URL">
          <Input
            type="url"
            name="url"
            control={form.control}
            onChange={updateModalBrandLink}
            placeholder="https://example.com"
            isRequired={true}
            isDisabled={isSubmitting}
          />
        </FormControl>

        <ModalActions>
          <Button
            type="button"
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            isDisabled={isSubmitting}
            onClick={() => closeModal()}
          />

          {link && deleteModalBrandLink ? (
            <Button
              type="button"
              label="Delete"
              variant={ButtonVariant.DESTRUCTIVE}
              size={ButtonSize.SM}
              onClick={deleteModalBrandLink}
              isLoading={isSubmitting}
            />
          ) : null}

          <Button
            type="submit"
            label={link ? 'Update' : 'Add'}
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !form.formState.isValid}
          />
        </ModalActions>
      </form>
    </Modal>
  );
}

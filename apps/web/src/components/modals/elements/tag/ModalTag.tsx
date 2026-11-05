import { type TagSchema, tagSchema } from '@genfeedai/client/schemas';
import {
  ButtonVariant,
  ModalEnum,
  TagCategory,
  TagScope,
} from '@genfeedai/contracts';
import type { ITag } from '@genfeedai/contracts/interfaces';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import type { ModalTagProps } from '@genfeedai/props/modals/modal.props';
import { TagsService } from '@genfeedai/services/content/tags.service';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Form, FormRow } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import {
  TAG_CATEGORY_OPTIONS,
  TAG_SCOPE_COLORS,
} from '@ui-constants/tags.constant';
import { type ChangeEvent, useCallback, useMemo, useRef } from 'react';
import { useCrudModal } from '@/hooks/ui/use-crud-modal/use-crud-modal';

const WHITESPACE_RUNS_PATTERN = /\s+/g;
const NON_SLUG_CHARS_PATTERN = /[^a-z0-9-]/g;

export default function ModalTag({ onConfirm }: ModalTagProps) {
  const defaultValues = useMemo(
    () => ({
      backgroundColor: TAG_SCOPE_COLORS[TagCategory.INGREDIENT].bg,
      category: TagCategory.INGREDIENT,
      description: '',
      key: '',
      label: '',
      textColor: TAG_SCOPE_COLORS[TagCategory.INGREDIENT].text,
    }),
    [],
  );

  // Ref to avoid re-renders when defaultValues object identity changes
  const defaultValuesRef = useRef(defaultValues);
  defaultValuesRef.current = defaultValues;

  const { form, formRef, isSubmitting, onSubmit, closeModal } = useCrudModal<
    ITag,
    TagSchema
  >({
    defaultValues,
    entity: null,
    modalId: ModalEnum.TAG,
    onConfirm,
    schema: tagSchema,
    serviceFactory: (token) => TagsService.getInstance(token),
    // The tags page lists organization-wide tags, so a tag created here is one
    // too: it does not depend on the admin having a brand selected.
    transformSubmitData: (formData) => ({
      ...formData,
      scope: TagScope.ORGANIZATION,
    }),
  });

  // Called when Cancel button is clicked - initiates the close
  const cancelModalTag = useCallback(() => {
    closeModal();
  }, [closeModal]);

  // Called by Modal's onClose after modal is closed - just cleanup
  const handleModalClosed = useCallback(() => {
    form.reset(defaultValuesRef.current);
  }, [form]);

  const updateModalTag = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target;
      form.setValue(name as keyof TagSchema, value, { shouldValidate: true });
    },
    [form],
  );

  const handleCategoryChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      form.setValue('category', e.target.value as TagCategory, {
        shouldValidate: true,
      });
    },
    [form],
  );

  return (
    <Modal id={ModalEnum.TAG} title="Add Tag" onClose={handleModalClosed}>
      <Form ref={formRef} onSubmit={onSubmit}>
        {hasFormErrors(form.formState.errors) && (
          <Alert variant="destructive">
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
            onChange={updateModalTag}
            isDisabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Key">
          <Input
            type="text"
            name="key"
            control={form.control}
            onChange={(e) => {
              // Ensure key is always lowercase with hyphens (replace spaces with hyphens)
              const value = e.target.value
                .toLowerCase()
                .replace(WHITESPACE_RUNS_PATTERN, '-') // Replace spaces with hyphens
                .replace(NON_SLUG_CHARS_PATTERN, ''); // Remove invalid characters
              e.target.value = value;
              updateModalTag(e);
            }}
            isDisabled={isSubmitting}
            placeholder="lowercase-with-hyphens"
          />
          <p className="text-xs text-foreground/70 mt-1">
            Unique identifier (lowercase, alphanumeric with hyphens)
          </p>
        </FormControl>

        <FormControl label="Tag Category">
          <SelectField
            name="category"
            control={form.control}
            onChange={handleCategoryChange}
            isDisabled={isSubmitting}
          >
            {TAG_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </FormControl>

        <FormControl label="Description">
          <Textarea
            name="description"
            control={form.control}
            onChange={updateModalTag}
            isDisabled={isSubmitting}
            placeholder="Enter tag description (optional)"
          />
        </FormControl>

        <FormRow>
          <FormControl label="Background Color">
            <Input
              type="color"
              name="backgroundColor"
              control={form.control}
              onChange={updateModalTag}
              isDisabled={isSubmitting}
            />
          </FormControl>

          <FormControl label="Text Color">
            <Input
              type="color"
              name="textColor"
              control={form.control}
              onChange={updateModalTag}
              isDisabled={isSubmitting}
            />
          </FormControl>
        </FormRow>

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={cancelModalTag}
            isLoading={isSubmitting}
          />

          <Button
            type="submit"
            label="Save"
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !form.formState.isValid}
          />
        </ModalActions>
      </Form>
    </Modal>
  );
}

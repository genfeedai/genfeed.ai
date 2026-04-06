import { type TagSchema, tagSchema } from '@genfeedai/client/schemas';
import {
  AlertCategory,
  ButtonVariant,
  ModalEnum,
  TagCategory,
} from '@genfeedai/enums';
import type { ITag } from '@genfeedai/interfaces';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { useCrudModal } from '@hooks/ui/use-crud-modal/use-crud-modal';
import type { Tag } from '@models/content/tag.model';
import type { ModalTagProps } from '@props/modals/modal.props';
import { TagsService } from '@services/content/tags.service';
import type { BaseService } from '@services/core/base.service';
import Button from '@ui/buttons/base/Button';
import Alert from '@ui/feedback/alert/Alert';
import FormControl from '@ui/forms/base/form-control/FormControl';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import FormTextarea from '@ui/forms/inputs/textarea/form-textarea/FormTextarea';
import FormSelect from '@ui/forms/selectors/select/form-select/FormSelect';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { TAG_SCOPE_COLORS } from '@ui-constants/tags.constant';
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';

// Map of category options for the select dropdown
const TAG_CATEGORY_OPTIONS = [
  { label: 'None', value: '' },
  { label: 'Credential', value: TagCategory.CREDENTIAL },
  { label: 'Ingredient', value: TagCategory.INGREDIENT },
  { label: 'Prompt', value: TagCategory.PROMPT },
  { label: 'Article', value: TagCategory.ARTICLE },
  { label: 'Organization', value: TagCategory.ORGANIZATION },
];

export default function ModalTag({
  item,
  entityType,
  entityId,
  onConfirm,
}: ModalTagProps) {
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

  const customSubmitHandler = useCallback(
    async (
      service: BaseService<Tag>,
      entity: ITag | null,
      formData: TagSchema,
    ): Promise<ITag> => {
      const tagsService = service as TagsService;
      if (entity) {
        // Use the base service patch method to send all form data
        // Cast category to TagCategory since the schema allows string | '' but Tag expects TagCategory
        const patchData: Partial<Tag> = {
          ...formData,
          category: (formData.category || undefined) as TagCategory | undefined,
        };
        const result = await tagsService.patch(entity.id, patchData);
        return result as ITag;
      }
      if (entityType && entityId) {
        const result = await tagsService.addTagToEntity(
          entityType as TagCategory,
          entityId,
          formData.label,
        );
        return result as ITag;
      }

      throw new Error('Entity type or entity ID is required');
    },
    [entityType, entityId],
  );

  const { form, formRef, isSubmitting, onSubmit, closeModal } = useCrudModal<
    ITag,
    TagSchema
  >({
    customSubmitHandler,
    defaultValues,
    entity: item || null,
    modalId: ModalEnum.TAG,
    onConfirm,
    schema: tagSchema,
    serviceFactory: (token) => TagsService.getInstance(token),
  });

  // Called when Cancel button is clicked - initiates the close
  const handleCancel = useCallback(() => {
    closeModal();
  }, [closeModal]);

  // Called by Modal's onClose after modal is closed - just cleanup
  const handleModalClosed = useCallback(() => {
    form.reset(defaultValuesRef.current);
  }, [form]);

  // Populate form when editing - only when item.id changes
  useEffect(() => {
    if (item) {
      form.setValue('label', item.label);
      form.setValue('key', item.key);
      form.setValue('description', item.description);
      form.setValue('category', item.category || TagCategory.INGREDIENT);

      form.setValue(
        'backgroundColor',
        item.backgroundColor || TAG_SCOPE_COLORS[TagCategory.INGREDIENT].bg,
      );

      form.setValue(
        'textColor',
        item.textColor || TAG_SCOPE_COLORS[TagCategory.INGREDIENT].text,
      );
    } else {
      form.reset(defaultValuesRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    item?.id,
    form,
    item?.backgroundColor,
    item?.category,
    item?.description,
    item?.key,
    item?.label,
    item,
  ]);

  const handleChange = useCallback(
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
    <Modal
      id={ModalEnum.TAG}
      title={item ? 'Edit Tag' : 'Add Tag'}
      onClose={handleModalClosed}
    >
      <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
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
            isDisabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Key">
          <FormInput
            type="text"
            name="key"
            control={form.control}
            onChange={(e) => {
              // Ensure key is always lowercase with hyphens (replace spaces with hyphens)
              const value = e.target.value
                .toLowerCase()
                .replace(/\s+/g, '-') // Replace spaces with hyphens
                .replace(/[^a-z0-9-]/g, ''); // Remove invalid characters
              e.target.value = value;
              handleChange(e);
            }}
            isDisabled={isSubmitting}
            placeholder="lowercase-with-hyphens"
          />
          <p className="text-xs text-foreground/70 mt-1">
            Unique identifier (lowercase, alphanumeric with hyphens)
          </p>
        </FormControl>

        <FormControl label="Tag Category">
          <FormSelect
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
          </FormSelect>
        </FormControl>

        <FormControl label="Description">
          <FormTextarea
            name="description"
            control={form.control}
            onChange={handleChange}
            isDisabled={isSubmitting}
            placeholder="Enter tag description (optional)"
          />
        </FormControl>

        <div className="grid grid-cols-2 gap-4">
          <FormControl label="Background Color">
            <FormInput
              type="color"
              name="backgroundColor"
              control={form.control}
              onChange={handleChange}
              isDisabled={isSubmitting}
            />
          </FormControl>

          <FormControl label="Text Color">
            <FormInput
              type="color"
              name="textColor"
              control={form.control}
              onChange={handleChange}
              isDisabled={isSubmitting}
            />
          </FormControl>
        </div>

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={handleCancel}
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
      </form>
    </Modal>
  );
}

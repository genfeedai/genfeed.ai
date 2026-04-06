import {
  type ElementStyleSchema,
  elementStyleSchema,
} from '@genfeedai/client/schemas';
import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  ModalEnum,
  ModelKey,
} from '@genfeedai/enums';
import type { IElementStyle } from '@genfeedai/interfaces';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { useCrudModal } from '@hooks/ui/use-crud-modal/use-crud-modal';
import type { ModalCrudProps } from '@props/modals/modal.props';
import { StylesService } from '@services/elements/styles.service';
import Button from '@ui/buttons/base/Button';
import Alert from '@ui/feedback/alert/Alert';
import FormControl from '@ui/forms/base/form-control/FormControl';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import FormCheckbox from '@ui/forms/selectors/checkbox/form-checkbox/FormCheckbox';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import type { ChangeEvent } from 'react';

export default function ModalStyle({
  item,
  onConfirm,
  onClose,
}: ModalCrudProps<IElementStyle>) {
  const { form, formRef, isSubmitting, onSubmit, closeModal } = useCrudModal<
    IElementStyle,
    ElementStyleSchema
  >({
    defaultValues: {
      description: '',
      key: '',
      label: '',
      models: [],
    },
    entity: item || null,
    modalId: ModalEnum.STYLE,
    onClose,
    onConfirm,
    schema: elementStyleSchema,
    serviceFactory: (token) => StylesService.getInstance(token),
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
      form.setValue(name as keyof ElementStyleSchema, value, {
        shouldValidate: true,
      });
    }
  };

  return (
    <Modal id={ModalEnum.STYLE} title={item ? 'Edit Style' : 'Create Style'}>
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
            isDisabled={isSubmitting}
          />
          <p className="text-xs text-foreground/70 mt-1">
            Unique identifier (lowercase, alphanumeric with hyphens)
          </p>
        </FormControl>

        <FormControl label="Models">
          <div className="flex gap-2 mb-2">
            <Button
              label="Select All"
              variant={ButtonVariant.GHOST}
              size={ButtonSize.XS}
              isDisabled={isSubmitting}
              onClick={() => {
                const allModels = Object.values(ModelKey);
                form.setValue('models', allModels, {
                  shouldValidate: true,
                });

                // Force re-render by triggering form state update
                form.trigger('models');
              }}
            />

            <Button
              label="Select None"
              variant={ButtonVariant.GHOST}
              size={ButtonSize.XS}
              isDisabled={isSubmitting}
              onClick={() => {
                form.setValue('models', [], {
                  shouldValidate: true,
                });

                // Force re-render by triggering form state update
                form.trigger('models');
              }}
            />
          </div>
          <div className="space-y-2 p-3 bg-background max-h-48 overflow-y-auto">
            {Object.values(ModelKey).map((model: ModelKey) => (
              <FormCheckbox
                key={model}
                name={`model-${model}`}
                label={model}
                isChecked={form.watch('models')?.includes(model)}
                onChange={(e) => {
                  const checked = (e.target as HTMLInputElement).checked;
                  const current = form.getValues('models') || [];

                  if (checked) {
                    form.setValue('models', [...current, model], {
                      shouldValidate: true,
                    });
                  } else {
                    form.setValue(
                      'models',
                      current.filter((modelKey: string) => modelKey !== model),
                      { shouldValidate: true },
                    );
                  }
                }}
                isDisabled={isSubmitting}
              />
            ))}
          </div>
          <p className="text-xs text-foreground/70 mt-1">
            Select one or more models this style applies to
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

'use client';

import {
  type TrainingEditSchema,
  trainingEditSchema,
} from '@genfeedai/client/schemas';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  ModalEnum,
} from '@genfeedai/enums';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import { useCrudModal } from '@genfeedai/hooks/ui/use-crud-modal/use-crud-modal';
import type { IBrand, ITraining } from '@genfeedai/interfaces';
import type { ModalTrainingProps } from '@genfeedai/props/modals/modal.props';
import { TrainingsService } from '@genfeedai/services/ai/trainings.service';
import { Code } from '@genfeedai/ui';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { type ChangeEvent, useEffect } from 'react';

export default function ModalTraining({
  training,
  onSuccess,
}: ModalTrainingProps) {
  const { brands } = useBrand();

  const { form, formRef, isSubmitting, onSubmit, closeModal } = useCrudModal<
    ITraining,
    TrainingEditSchema
  >({
    defaultValues: {
      brand: '',
      description: '',
      label: '',
    },
    entity: training || null,
    modalId: ModalEnum.TRAINING_EDIT,
    onConfirm: onSuccess || (() => {}),
    schema: trainingEditSchema,
    serviceFactory: (token) => TrainingsService.getInstance(token),
    transformSubmitData: (formData) => {
      const updateData: Partial<ITraining> = {
        description: formData.description,
        label: formData.label,
      };

      // Only include brand if it has a value
      if (formData.brand) {
        updateData.brand = formData.brand;
      }

      return updateData;
    },
  });

  // Handle brand field transformation (could be object or string)
  useEffect(() => {
    if (training) {
      const brandId =
        typeof training.brand === 'string'
          ? training.brand
          : training.brand?.id;

      if (brandId) {
        form.setValue('brand', brandId, { shouldValidate: true });
      }
    }
  }, [training, form]);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    form.setValue(name as keyof TrainingEditSchema, value, {
      shouldValidate: true,
    });
  };

  if (!training) {
    return null;
  }

  return (
    <Modal id={ModalEnum.TRAINING_EDIT} title="Edit Training">
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col">
        {hasFormErrors(form.formState.errors) && (
          <Alert type={AlertCategory.ERROR} className="mb-4">
            <div className="space-y-1">
              {parseFormErrors(form.formState.errors).map((error, index) => (
                <div key={index}>{error}</div>
              ))}
            </div>
          </Alert>
        )}

        <div className="flex-1 space-y-4 pr-2">
          <FormControl
            label="Label"
            error={form.formState.errors.label?.message}
            isRequired
          >
            <Input
              type="text"
              name="label"
              control={form.control}
              onChange={handleChange}
              placeholder="Enter training name"
              isRequired={true}
              isDisabled={isSubmitting}
            />
          </FormControl>

          <FormControl
            label="Description"
            error={form.formState.errors.description?.message}
          >
            <Input
              type="text"
              name="description"
              control={form.control}
              onChange={handleChange}
              placeholder="Enter training description"
              isDisabled={isSubmitting}
            />
          </FormControl>

          <FormControl
            label="Brand"
            error={form.formState.errors.brand?.message}
          >
            <SelectField
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
            </SelectField>
          </FormControl>

          <div className="flex items-center gap-2 p-4 bg-background/50">
            <span className="text-sm text-muted-foreground">Trigger</span>
            <Code size="md">{training.trigger}</Code>
            <span className="text-xs text-muted-foreground ml-auto">
              (cannot be edited)
            </span>
          </div>
        </div>

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.LG}
            className="md:h-9 md:px-4 md:py-2 mb-4 md:mb-0"
            isLoading={isSubmitting}
            onClick={() => closeModal()}
          />

          <Button
            type="submit"
            label="Update"
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !form.formState.isValid}
          />
        </ModalActions>
      </form>
    </Modal>
  );
}

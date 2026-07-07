import { type ModelSchema, modelSchema } from '@genfeedai/client/schemas';
import { MODEL_KEYS } from '@genfeedai/constants';
import { ModalEnum, ModelCategory, ModelProvider } from '@genfeedai/enums';
import { closeModal as closeModalHelper } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useCrudModal } from '@genfeedai/hooks/ui/use-crud-modal/use-crud-modal';
import type { IModel } from '@genfeedai/interfaces';
import { Model } from '@genfeedai/models/ai/model.model';
import type { ModalModelProps } from '@genfeedai/props/modals/modal.props';
import { ModelsService } from '@genfeedai/services/ai/models.service';
import Modal from '@ui/modals/modal/Modal';
import { type ChangeEvent, useEffect, useMemo } from 'react';
import ModalModelFormContent from './ModalModelFormContent';
import ModalModelViewContent from './ModalModelViewContent';

export default function ModalModel({
  entity: model,
  onConfirm,
  onClose,
  mode = 'edit',
}: ModalModelProps) {
  const isViewMode = mode === 'view';

  const modelCategories = useMemo(
    () => Object.values(ModelCategory) as ModelCategory[],
    [],
  );

  const modelProviders = useMemo(
    () => Object.values(ModelProvider) as ModelProvider[],
    [],
  );

  const modelKeys = useMemo(
    () => Object.values(MODEL_KEYS) as IModel['key'][],
    [],
  );

  const defaultModelValues = useMemo<ModelSchema>(
    () => ({
      category: modelCategories[0] ?? ModelCategory.IMAGE,
      cost: 0,
      description: '',
      key:
        modelKeys[0] ??
        (MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_FAST as IModel['key']),
      label: '',
      provider: modelProviders[0] ?? ModelProvider.REPLICATE,
    }),
    [modelCategories, modelKeys, modelProviders],
  );

  const { form, formRef, isSubmitting, onSubmit, closeModal } = useCrudModal<
    IModel,
    ModelSchema
  >({
    defaultValues: defaultModelValues,
    entity: model || null,
    modalId: ModalEnum.MODEL,
    onClose,
    onConfirm,
    schema: modelSchema,
    serviceFactory: (token: string) => ModelsService.getInstance(token),
    transformSubmitData: (formData) =>
      new Model({
        ...formData,
        category: formData.category as ModelCategory,
        key: formData.key as IModel['key'],
      }),
  });

  useEffect(() => {
    if (model) {
      form.reset({
        category: model.category || defaultModelValues.category,
        cost: model.cost ?? defaultModelValues.cost,
        description: model.description,
        key: (model.key || defaultModelValues.key) as IModel['key'],
        label: model.label,
        provider: model.provider || defaultModelValues.provider,
      });
    }
  }, [defaultModelValues, form, model]);

  const setFieldValue = <Field extends keyof ModelSchema>(
    field: Field,
    value: ModelSchema[Field],
  ) => {
    form.setValue(field as Parameters<typeof form.setValue>[0], value, {
      shouldValidate: true,
    });
  };

  const updateModalModel = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;

    switch (name) {
      case 'label':
        setFieldValue('label', value);
        break;

      case 'description':
        setFieldValue('description', value);
        break;

      case 'key':
        setFieldValue('key', value as IModel['key']);
        break;

      case 'category':
        setFieldValue('category', value as ModelCategory);
        break;

      case 'provider':
        setFieldValue('provider', value as ModelProvider);
        break;

      case 'cost': {
        const numericValue = value === '' ? 0 : Number(value);
        setFieldValue('cost', Number.isNaN(numericValue) ? 0 : numericValue);
        break;
      }

      default:
        break;
    }
  };

  // Called when Close/Cancel button is clicked - initiates the close
  const cancelModalModel = isViewMode
    ? () => {
        closeModalHelper(ModalEnum.MODEL);
        onClose?.();
      }
    : () => closeModal(false);

  // Determine modal title based on mode
  // Use model for stable rendering during close animation
  const modalTitle = isViewMode
    ? model?.label || 'Model Details'
    : model
      ? 'Edit Model'
      : 'Add Model';

  return (
    <Modal id={ModalEnum.MODEL} title={modalTitle}>
      {isViewMode && model ? (
        <ModalModelViewContent
          model={model}
          cancelModalModel={cancelModalModel}
        />
      ) : (
        <ModalModelFormContent
          form={form}
          formRef={formRef}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
          updateModalModel={updateModalModel}
          cancelModalModel={cancelModalModel}
          model={model}
          modelProviders={modelProviders}
          modelCategories={modelCategories}
        />
      )}
    </Modal>
  );
}

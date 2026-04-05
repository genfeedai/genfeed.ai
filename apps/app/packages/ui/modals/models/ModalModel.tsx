import type { IModel } from '@genfeedai/interfaces';
import { type ModelSchema, modelSchema } from '@genfeedai/client/schemas';
import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  ModalEnum,
  ModelCategory,
  ModelKey,
  ModelProvider,
} from '@genfeedai/enums';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { closeModal as closeModalHelper } from '@helpers/ui/modal/modal.helper';
import { useCrudModal } from '@hooks/ui/use-crud-modal/use-crud-modal';
import { Model } from '@models/ai/model.model';
import type { ModalModelProps } from '@props/modals/modal.props';
import { ModelsService } from '@services/ai/models.service';
import Button from '@ui/buttons/base/Button';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import FormControl from '@ui/forms/base/form-control/FormControl';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import FormSelect from '@ui/forms/selectors/select/form-select/FormSelect';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { type ChangeEvent, useEffect, useMemo } from 'react';

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
    () => Object.values(ModelKey) as IModel['key'][],
    [],
  );

  const defaultModelValues = useMemo<ModelSchema>(
    () => ({
      category: modelCategories[0] ?? ModelCategory.IMAGE,
      cost: 0,
      description: '',
      key:
        modelKeys[0] ??
        (ModelKey.REPLICATE_GOOGLE_IMAGEN_4_FAST as IModel['key']),
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
      form.setValue('label', model.label, { shouldValidate: true });
      form.setValue('description', model.description, {
        shouldValidate: true,
      });

      form.setValue(
        'key',
        (model.key || defaultModelValues.key) as IModel['key'],
        {
          shouldValidate: true,
        },
      );

      form.setValue('category', model.category || defaultModelValues.category, {
        shouldValidate: true,
      });

      form.setValue('provider', model.provider || defaultModelValues.provider, {
        shouldValidate: true,
      });

      form.setValue('cost', model.cost ?? defaultModelValues.cost, {
        shouldValidate: true,
      });
    }
  }, [defaultModelValues, form, model]);

  const setFieldValue = <Field extends keyof ModelSchema>(
    field: Field,
    value: ModelSchema[Field],
  ) => {
    form.setValue(field as any, value, { shouldValidate: true });
  };

  const handleChange = (
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
  const handleCancel = isViewMode
    ? () => {
        closeModalHelper(ModalEnum.MODEL);
        onClose?.();
      }
    : () => closeModal(false);

  // Helper to get quality tier badge variant
  const getQualityTierBadgeVariant = (
    tier?: string,
  ): 'success' | 'info' | 'warning' | 'ghost' => {
    switch (tier) {
      case 'ultra':
        return 'success';
      case 'high':
        return 'info';
      case 'standard':
        return 'warning';
      case 'basic':
        return 'ghost';
      default:
        return 'ghost';
    }
  };

  // Helper to get speed tier badge variant
  const getSpeedTierBadgeVariant = (
    tier?: string,
  ): 'success' | 'info' | 'warning' | 'ghost' => {
    switch (tier) {
      case 'fast':
        return 'success';
      case 'medium':
        return 'info';
      case 'slow':
        return 'warning';
      default:
        return 'ghost';
    }
  };

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
        // View Mode - Read-only display using model schema data
        <>
          <div className="space-y-6">
            {/* Badges row */}
            <div className="flex flex-wrap gap-2">
              <Badge variant={ButtonVariant.SECONDARY} size={ComponentSize.SM}>
                {model.category}
              </Badge>

              <Badge variant="accent" size={ComponentSize.SM}>
                {model.costTier === 'high'
                  ? 'Best'
                  : model.costTier === 'medium'
                    ? 'Better'
                    : 'Good'}
              </Badge>

              {model.qualityTier && (
                <Badge
                  variant={getQualityTierBadgeVariant(model.qualityTier)}
                  size={ComponentSize.SM}
                >
                  {model.qualityTier}
                </Badge>
              )}

              {model.speedTier && (
                <Badge
                  variant={getSpeedTierBadgeVariant(model.speedTier)}
                  size={ComponentSize.SM}
                >
                  {model.speedTier}
                </Badge>
              )}
            </div>

            {/* Description */}
            {model.description && (
              <div>
                <h4 className="text-sm font-medium text-foreground/70 mb-2">
                  Description
                </h4>
                <p className="text-foreground">{model.description}</p>
              </div>
            )}

            {/* Recommended For */}
            {model.recommendedFor && model.recommendedFor.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-foreground/70 mb-2">
                  Recommended For
                </h4>
                <div className="flex flex-wrap gap-2">
                  {model.recommendedFor.map((item, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-background rounded-full text-sm"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Capabilities */}
            {model.capabilities && model.capabilities.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-foreground/70 mb-2">
                  Capabilities
                </h4>
                <div className="flex flex-wrap gap-2">
                  {model.capabilities.map((capability, index) => (
                    <Badge
                      key={index}
                      variant="outline"
                      size={ComponentSize.SM}
                    >
                      {capability}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Supported Features */}
            {model.supportsFeatures && model.supportsFeatures.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-foreground/70 mb-2">
                  Supported Features
                </h4>
                <div className="flex flex-wrap gap-2">
                  {model.supportsFeatures.map((feature, index) => (
                    <Badge
                      key={index}
                      variant="outline"
                      size={ComponentSize.SM}
                    >
                      {feature}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Dimensions */}
            {(model.minDimensions || model.maxDimensions) && (
              <div>
                <h4 className="text-sm font-medium text-foreground/70 mb-2">
                  Supported Dimensions
                </h4>
                <div className="text-sm text-foreground bg-background p-3">
                  {model.minDimensions && (
                    <div>
                      Min: {model.minDimensions.width} x{' '}
                      {model.minDimensions.height}px
                    </div>
                  )}
                  {model.maxDimensions && (
                    <div>
                      Max: {model.maxDimensions.width} x{' '}
                      {model.maxDimensions.height}px
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Model Key (technical info) */}
            <div className="pt-4 border-t border-white/[0.08]">
              <span className="text-xs text-foreground/50 font-mono">
                {model.key}
              </span>
            </div>
          </div>

          <ModalActions>
            <Button
              label="Close"
              variant={ButtonVariant.DEFAULT}
              onClick={handleCancel}
            />
          </ModalActions>
        </>
      ) : (
        // Edit Mode - Form
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
              placeholder="Enter model label"
              isRequired={true}
              isDisabled={isSubmitting}
            />
          </FormControl>

          <FormControl label="Description">
            <FormInput
              type="text"
              name="description"
              control={form.control}
              onChange={handleChange}
              placeholder="Enter model description"
              isDisabled={isSubmitting}
            />
          </FormControl>

          <FormControl label="Key">
            <FormInput
              type="text"
              name="key"
              control={form.control}
              onChange={handleChange}
              placeholder="Enter model key"
              isRequired={true}
              isDisabled={isSubmitting}
            />
          </FormControl>

          <div className="grid grid-cols-2 gap-2">
            <FormSelect
              name="provider"
              control={form.control}
              onChange={handleChange}
              isDisabled={isSubmitting}
            >
              {modelProviders.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </FormSelect>

            <FormSelect
              name="category"
              control={form.control}
              onChange={handleChange}
              isDisabled={isSubmitting}
            >
              {modelCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </FormSelect>
          </div>

          <FormControl label="Cost" className="mt-4">
            <FormInput
              type="number"
              name="cost"
              control={form.control}
              onChange={handleChange}
              placeholder="Enter model cost"
              isRequired={true}
              isDisabled={isSubmitting}
            />
          </FormControl>

          <ModalActions>
            <Button
              label="Cancel"
              variant={ButtonVariant.SECONDARY}
              onClick={handleCancel}
              isLoading={isSubmitting}
            />

            <Button
              type="submit"
              label={model ? 'Update' : 'Add'}
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.LG}
              className="md:h-9 md:px-4 md:py-2 mb-4 md:mb-0"
              isLoading={isSubmitting}
              isDisabled={isSubmitting || !form.formState.isValid}
            />
          </ModalActions>
        </form>
      )}
    </Modal>
  );
}

import type { ModalEnum } from '@genfeedai/enums';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  DefaultValues,
  FieldValues,
  Path,
  PathValue,
  UseFormReturn,
} from 'react-hook-form';

export interface UseModalFormOptions<TEntity, TFormValues extends FieldValues> {
  /**
   * The modal ID for closing the modal
   */
  modalId: ModalEnum;

  /**
   * The react-hook-form instance
   */
  form: UseFormReturn<TFormValues>;

  /**
   * Default values to reset the form to
   */
  defaultValues: DefaultValues<TFormValues>;

  /**
   * Optional callback when modal is closed
   */
  onClose?: () => void;

  /**
   * Optional callback after successful submit
   */
  onSuccess?: (data: TEntity) => void;

  /**
   * Map entity values to form values for populating the form when editing
   */
  mapEntityToForm?: (
    entity: TEntity,
  ) => Partial<{ [K in Path<TFormValues>]: PathValue<TFormValues, K> }>;
}

export interface UseModalFormReturn<TFormValues extends FieldValues> {
  /**
   * Current error message
   */
  error: string | null;

  /**
   * Set error message
   */
  setError: (error: string | null) => void;

  /**
   * Clear error message
   */
  clearError: () => void;

  /**
   * Close the modal and reset form
   */
  handleClose: () => void;

  /**
   * Reset the form to default values
   */
  resetForm: () => void;

  /**
   * Populate form with entity values (for edit mode)
   */
  populateForm: (
    values: Partial<{ [K in Path<TFormValues>]: PathValue<TFormValues, K> }>,
  ) => void;
}

/**
 * Hook to simplify modal form handling patterns.
 * Provides common functionality for error state, form reset, and modal closing.
 *
 * @example
 * ```tsx
 * const form = useForm<BrandSchema>({ ... });
 *
 * const { error, setError, handleClose, populateForm } = useModalForm({
 *   modalId: ModalEnum.BRAND,
 *   form,
 *   defaultValues: { label: '', slug: '' },
 *   mapEntityToForm: (brand) => ({
 *     label: brand.label,
 *     slug: brand.slug,
 *   }),
 * });
 *
 * // Populate form when editing
 * useEffect(() => {
 *   if (brand) {
 *     populateForm(mapEntityToForm(brand));
 *   }
 * }, [brand]);
 * ```
 */
export function useModalForm<TEntity, TFormValues extends FieldValues>({
  modalId,
  form,
  defaultValues,
  onClose,
}: UseModalFormOptions<TEntity, TFormValues>): UseModalFormReturn<TFormValues> {
  const [error, setError] = useState<string | null>(null);

  // Ref for callback to prevent re-renders
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Stabilize defaultValues to prevent unnecessary re-renders
  const _defaultValuesKey = useMemo(
    () => JSON.stringify(defaultValues),
    [defaultValues],
  );
  const stableDefaultValues = useMemo(
    () => defaultValues,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaultValues],
  );
  const defaultValuesRef = useRef(stableDefaultValues);
  defaultValuesRef.current = stableDefaultValues;

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const resetForm = useCallback(() => {
    form.reset(defaultValuesRef.current as TFormValues);
    clearError();
  }, [form, clearError]);

  const handleClose = useCallback(() => {
    resetForm();
    closeModal(modalId);
    onCloseRef.current?.();
  }, [resetForm, modalId]);

  const populateForm = useCallback(
    (
      values: Partial<{ [K in Path<TFormValues>]: PathValue<TFormValues, K> }>,
    ) => {
      const entries = Object.entries(values) as [
        Path<TFormValues>,
        PathValue<TFormValues, Path<TFormValues>>,
      ][];

      for (const [key, value] of entries) {
        if (value !== undefined) {
          form.setValue(key, value, { shouldValidate: true });
        }
      }
    },
    [form],
  );

  return {
    clearError,
    error,
    handleClose,
    populateForm,
    resetForm,
    setError,
  };
}

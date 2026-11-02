import {
  type PresetElementSchema,
  presetElementSchema,
} from '@genfeedai/client/schemas';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { ButtonVariant, ModalEnum, ModelCategory } from '@genfeedai/contracts';
import type { IPreset } from '@genfeedai/contracts/interfaces';
import type { ModalCreateProps } from '@genfeedai/props/modals/modal.props';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { PresetsService } from '@genfeedai/services/elements/presets.service';
import { normalizeElementKey } from '@ui/display/element-scope-badge/element-row-sidebar';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { Form } from '@ui/primitives/form';
import { useTranslations } from 'next-intl';
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useCrudModal } from '@/hooks/ui/use-crud-modal/use-crud-modal';
import { usePromptEnhance } from '@/hooks/ui/use-prompt-enhance/use-prompt-enhance';
import ModalPresetFields from './ModalPresetFields';

/**
 * Creates a preset. Existing presets are edited in place in the context
 * sidebar (see `PresetDescriptionActions` for the AI enhance).
 */
export default function ModalPreset({ onConfirm, onClose }: ModalCreateProps) {
  const translateCreate = useTranslations('ui.createModal');
  const { brandId, organizationId } = useBrand();
  const [error, setError] = useState<string | null>(null);

  const clipboardService = ClipboardService.getInstance();
  const { enhance, isEnhancing } = usePromptEnhance();

  const [previousPrompt, setPreviousPrompt] = useState<string | null>(null);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { form, formRef, isSubmitting, onSubmit, closeModal } = useCrudModal<
    IPreset,
    PresetElementSchema
  >({
    defaultValues: {
      category: ModelCategory.IMAGE,
      description: '',
      isActive: true,
      key: '',
      label: '',
      prompt: '',
      aspectRatio: '',
      duration: undefined,
      promptTemplate: '',
      camera: '',
      cameraMovement: '',
      lens: '',
      lighting: '',
      mood: '',
      scene: '',
      style: '',
    },
    entity: null,
    modalId: ModalEnum.PRESET,
    onClose,
    onConfirm,
    schema: presetElementSchema,
    serviceFactory: (token) => PresetsService.getInstance(token),
    transformSubmitData: (formData) => ({
      ...formData,
      ...(organizationId ? { organizationId } : {}),
      ...(brandId ? { brandId } : {}),
    }),
  });

  // Watch the description field for reactive updates
  const watchedDescription = form.watch('description');

  const updateModalPreset = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value, type: inputType } = e.target;
    if (name === 'duration') {
      form.setValue('duration', value === '' ? undefined : Number(value), {
        shouldValidate: true,
      });
    } else if (inputType === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      form.setValue(name as Parameters<typeof form.setValue>[0], checked, {
        shouldValidate: true,
      });
    } else if (name === 'key') {
      form.setValue('key', normalizeElementKey(value), {
        shouldValidate: true,
      });
    } else {
      form.setValue(name as Parameters<typeof form.setValue>[0], value, {
        shouldValidate: true,
      });
    }
  };

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  const handleUndo = useCallback(() => {
    if (previousPrompt !== null) {
      form.setValue('description', previousPrompt, { shouldValidate: true });
      setPreviousPrompt(null);
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
        undoTimeoutRef.current = null;
      }
    }
  }, [form, previousPrompt]);

  const enhanceDescription = async () => {
    setPreviousPrompt(watchedDescription || null);
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    try {
      const result = await enhance(
        watchedDescription ?? '',
        form.getValues('category') ?? ModelCategory.IMAGE,
      );
      form.setValue('description', result, { shouldValidate: true });
      // The undo stays available for 30 seconds.
      undoTimeoutRef.current = setTimeout(() => {
        setPreviousPrompt(null);
        undoTimeoutRef.current = null;
      }, 30_000);
    } catch {
      setError('Enhancement failed. Please try again.');
    }
  };

  return (
    <Modal
      id={ModalEnum.PRESET}
      title={translateCreate('preset')}
      error={error}
      onClose={() => setError(null)}
    >
      <Form ref={formRef} onSubmit={onSubmit}>
        <ModalPresetFields
          control={form.control}
          watchedDescription={watchedDescription}
          isSubmitting={isSubmitting}
          isCopying={false}
          isEnhancing={isEnhancing}
          previousPrompt={previousPrompt}
          onChange={updateModalPreset}
          onCopy={() =>
            clipboardService.copyToClipboard(watchedDescription || '')
          }
          onEnhance={enhanceDescription}
          onUndo={handleUndo}
        />

        <ModalActions>
          <Button
            label={translateCreate('cancel')}
            variant={ButtonVariant.SECONDARY}
            onClick={() => closeModal()}
            isLoading={isSubmitting}
          />

          <Button
            type="submit"
            label={translateCreate('create')}
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !form.formState.isValid}
          />
        </ModalActions>
      </Form>
    </Modal>
  );
}

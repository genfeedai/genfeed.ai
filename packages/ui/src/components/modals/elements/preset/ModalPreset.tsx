import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  type PresetElementSchema,
  presetElementSchema,
} from '@genfeedai/client/schemas';
import {
  ButtonVariant,
  ModalEnum,
  ModelCategory,
  SystemPromptKey,
} from '@genfeedai/enums';
import type { IPreset } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCrudModal } from '@hooks/ui/use-crud-modal/use-crud-modal';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { Prompt } from '@models/content/prompt.model';
import type { ModalCrudProps } from '@props/modals/modal.props';
import { PromptsService } from '@services/content/prompts.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { createPromptHandler } from '@services/core/socket-manager.service';
import { PresetsService } from '@services/elements/presets.service';
import TextareaLabelActions from '@ui/content/textarea-label-actions/TextareaLabelActions';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { WebSocketPaths } from '@utils/network/websocket.util';
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export default function ModalPreset({
  item,
  onConfirm,
  onClose,
}: ModalCrudProps<IPreset>) {
  const { brandId, organizationId } = useBrand();
  const [error, setError] = useState<string | null>(null);

  const clipboardService = ClipboardService.getInstance();

  const getPromptsService = useAuthedService((token: string) =>
    PromptsService.getInstance(token),
  );
  const { subscribe } = useSocketManager();

  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
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
    },
    entity: item || null,
    modalId: ModalEnum.PRESET,
    onClose,
    onConfirm,
    schema: presetElementSchema,
    serviceFactory: (token) => PresetsService.getInstance(token),
    transformSubmitData: (formData) => {
      // Include organization and brand if provided (for admin use)
      const data = {
        ...formData,
      };

      if (organizationId) {
        data.organization = organizationId;
      }

      if (brandId) {
        data.brand = brandId;
      }

      return data;
    },
  });
  const promptSubscriptionRef = useRef<(() => void) | null>(null);

  // Custom close handler that resets local states
  const handleClose = () => {
    setIsEnhancing(false);
    setIsCopying(false);
    onClose?.();
    closeModal();
  };

  const cleanupPromptSubscription = () => {
    if (promptSubscriptionRef.current) {
      promptSubscriptionRef.current();
      promptSubscriptionRef.current = null;
    }
  };

  // Watch the description field for reactive updates
  const watchedDescription = form.watch('description');

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value, type: inputType } = e.target;
    if (inputType === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      form.setValue(name as any, checked, { shouldValidate: true });
    } else {
      // Format key if key field changes
      if (name === 'key') {
        const formattedKey = value
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');
        form.setValue('key', formattedKey, { shouldValidate: true });
      } else {
        form.setValue(name as any, value, { shouldValidate: true });
      }
    }
  };

  useEffect(() => {
    return () => {
      cleanupPromptSubscription();
    };
  }, [cleanupPromptSubscription]);

  const listenForSocket = (promptId: string) => {
    const event = WebSocketPaths.prompt(promptId);

    // Add timeout to prevent indefinite loading state
    const timeoutId = setTimeout(() => {
      logger.error('Prompt enhancement timed out');
      setError('Enhancement timed out. Please try again.');
      setIsEnhancing(false);
      cleanupPromptSubscription();
    }, 30_000); // 30 second timeout

    const handler = createPromptHandler<string>(
      (result) => {
        clearTimeout(timeoutId);
        form.setValue('description', result, { shouldValidate: true });
        setIsEnhancing(false);
        cleanupPromptSubscription();

        // Start 30s timeout to clear undo state
        if (undoTimeoutRef.current) {
          clearTimeout(undoTimeoutRef.current);
        }
        undoTimeoutRef.current = setTimeout(() => {
          setPreviousPrompt(null);
          undoTimeoutRef.current = null;
        }, 30000);
      },
      (error) => {
        clearTimeout(timeoutId);

        logger.error('Prompt enhancement failed via websocket', error);
        setError('Enhancement failed. Please try again.');
        setIsEnhancing(false);
        cleanupPromptSubscription();
      },
    );

    cleanupPromptSubscription();
    promptSubscriptionRef.current = subscribe(event, handler);
  };

  const handleCopy = async (text: string) =>
    await clipboardService.copyToClipboard(text);

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
    // Save current prompt for undo functionality
    setPreviousPrompt(watchedDescription || null);

    // Clear any existing undo timeout
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    setIsEnhancing(true);

    const url = 'POST /prompts';
    try {
      const service = await getPromptsService();

      // Determine system prompt key based on preset category
      const presetCategory = form.watch('category');
      let systemPromptKey: SystemPromptKey = SystemPromptKey.IMAGE;
      if (presetCategory === 'video') {
        systemPromptKey = SystemPromptKey.VIDEO;
      } else if (presetCategory === 'music') {
        systemPromptKey = SystemPromptKey.MUSIC;
      }

      const promptData = new Prompt({
        brand: brandId,
        category: `presets-description-${presetCategory}`,
        isSkipEnhancement: false,
        organization: organizationId,
        original: watchedDescription,
        systemPromptKey,
        useRAG: true, // Enable RAG if context bases exist
      });

      const data = await service.post(promptData);

      logger.info(`${url} success`, data);

      listenForSocket(data.id);
    } catch (error) {
      logger.error(`${url} failed`, error);
      setIsEnhancing(false);
    }
  };

  return (
    <Modal
      id={ModalEnum.PRESET}
      title={item?.id ? 'Edit Preset' : 'Create Preset'}
      error={error}
      onClose={() => setError(null)}
    >
      <form ref={formRef} onSubmit={onSubmit}>
        <FormControl label="Label">
          <Input
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
          <Input
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

        <FormControl label="Type">
          <SelectField
            name="category"
            control={form.control}
            onChange={handleChange}
            isRequired={true}
            isDisabled={isSubmitting}
          >
            {Object.values(ModelCategory).map((elementType) => (
              <option
                key={elementType}
                value={elementType}
                className="capitalize"
              >
                {elementType}
              </option>
            ))}
          </SelectField>
        </FormControl>

        <FormControl
          label={
            <TextareaLabelActions
              label="Description"
              onCopy={() => handleCopy(watchedDescription || '')}
              onEnhance={enhanceDescription}
              onUndo={handleUndo}
              showUndo={!!previousPrompt}
              isCopyDisabled={!watchedDescription || isCopying || isSubmitting}
              isEnhanceDisabled={
                !watchedDescription || isEnhancing || isSubmitting
              }
              isEnhancing={isEnhancing}
            />
          }
        >
          <Textarea
            name="description"
            control={form.control}
            onChange={handleChange}
            placeholder="Enter description (optional)"
            isDisabled={isSubmitting || isEnhancing}
          />
        </FormControl>

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={() => handleClose()}
            isLoading={isSubmitting}
          />

          <Button
            type="submit"
            label={item?.id ? 'Update' : 'Create'}
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !form.formState.isValid}
          />
        </ModalActions>
      </form>
    </Modal>
  );
}

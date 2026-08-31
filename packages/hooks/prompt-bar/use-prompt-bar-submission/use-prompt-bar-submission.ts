import type {
  UsePromptBarSubmissionOptions,
  UsePromptBarSubmissionReturn,
} from '@genfeedai/props/prompt-bars/prompt-bar-submission.props';
import type { KeyboardEvent, SyntheticEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Prompt text + submit lifecycle shared by instruction composers.
 *
 * Owns the four rules each surface used to reimplement: trim before submit,
 * refuse while a previous enhancement is in flight, clear only on success, and
 * submit on Enter unless Shift is held.
 */
export function usePromptBarSubmission(
  options: UsePromptBarSubmissionOptions,
): UsePromptBarSubmissionReturn {
  const { isEnhancing, onSubmit } = options;

  const [prompt, setPrompt] = useState('');

  // Surfaces close over changing state (tone, platform, count) in onSubmit.
  // A ref keeps handleSubmit stable without ever calling a stale handler.
  const onSubmitRef = useRef(onSubmit);
  const isEnhancingRef = useRef(isEnhancing);

  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  useEffect(() => {
    isEnhancingRef.current = isEnhancing;
  }, [isEnhancing]);

  const handleSubmit = useCallback(
    async (event?: SyntheticEvent): Promise<void> => {
      event?.preventDefault();

      const trimmed = prompt.trim();
      if (!trimmed || isEnhancingRef.current) {
        return;
      }

      try {
        await onSubmitRef.current(trimmed);
        setPrompt('');
      } catch {
        // Keep the prompt so the user can retry; surfaces own error reporting.
      }
    },
    [prompt],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  return {
    handleKeyDown,
    handleSubmit,
    isSubmitDisabled: !prompt.trim() || isEnhancing,
    prompt,
    setPrompt,
  };
}

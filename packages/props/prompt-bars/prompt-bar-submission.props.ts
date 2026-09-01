import type { KeyboardEvent, SyntheticEvent } from 'react';

export interface UsePromptBarSubmissionOptions {
  isEnhancing: boolean;
  onSubmit: (prompt: string) => Promise<void> | void;
}

export interface UsePromptBarSubmissionReturn {
  handleKeyDown: (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  handleSubmit: (event?: SyntheticEvent) => Promise<void>;
  isSubmitDisabled: boolean;
  prompt: string;
  setPrompt: (value: string) => void;
}

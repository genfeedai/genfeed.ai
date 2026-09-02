import type { ChangeEvent } from 'react';

export interface ITextareaProps {
  value?: string;
  placeholder?: string;
  className?: string;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  rows?: number;
  onChange?: (e: ChangeEvent<HTMLTextAreaElement>) => void;
}

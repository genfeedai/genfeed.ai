import type { DropdownDirection } from '@genfeedai/enums';

export interface PromptDropdownProps {
  promptText: string | null | undefined;
  onCopy?: (promptText: string) => void;
  onReprompt?: () => void;
  direction?: DropdownDirection;
  className?: string;
  isDisabled?: boolean;
}

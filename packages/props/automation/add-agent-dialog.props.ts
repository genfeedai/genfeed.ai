export type AddAgentMode = 'custom' | 'library';

export interface AddAgentDialogProps {
  initialMode?: AddAgentMode;
  isOpen: boolean;
  onCreated: () => Promise<void> | void;
  onOpenChange: (isOpen: boolean) => void;
}

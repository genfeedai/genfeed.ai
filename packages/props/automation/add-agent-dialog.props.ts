export interface AddAgentDialogProps {
  isOpen: boolean;
  onCreated: () => Promise<void> | void;
  onOpenChange: (isOpen: boolean) => void;
}

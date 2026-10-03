import type {
  AgentArtifactReference,
  LibraryAsset,
} from '@genfeedai/contracts/interfaces';
export interface LibraryAttachmentActionsProps {
  assets: readonly LibraryAsset[];
  isDisabled: boolean;
}
export interface ChatInputProps {
  onSend: (
    content: string,
    references?: AgentArtifactReference[],
  ) => Promise<boolean>;
  disabled?: boolean;
  suggestedPrompt?: string;
}

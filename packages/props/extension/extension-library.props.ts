import type {
  AgentArtifactReference,
  LibraryAsset,
} from '@genfeedai/contracts/interfaces';
export interface LibraryAttachmentActionsProps {
  assets: readonly LibraryAsset[];
  isDisabled: boolean;
}
export interface ChatInputProps {
  /** Library assets already attached when the input opens, such as a saved source's media. */
  initialAssets?: readonly LibraryAsset[];
  onSend: (
    content: string,
    references?: AgentArtifactReference[],
  ) => Promise<boolean>;
  disabled?: boolean;
  suggestedPrompt?: string;
}

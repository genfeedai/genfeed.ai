/** One reference slot (e.g. Start frame) offered from a composer's `+` menu. */
export interface PromptBarReferenceSource {
  accept: string;
  id: string;
  isAttachmentDisabled?: boolean;
  isLibraryDisabled?: boolean;
  label: string;
  onAddFiles?: (files: File[]) => void;
  onOpenLibrary: () => void;
}

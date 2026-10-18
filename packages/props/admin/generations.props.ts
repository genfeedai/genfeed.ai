/**
 * Props and view models for the admin Generations page, which lists generated
 * media and the prompts that never produced any in one ledger.
 */

export type GenerationKind = 'generation' | 'prompt';

export type GenerationMediaKind = 'image' | 'video' | 'audio' | 'none';

export interface GenerationView {
  /** Brand harness lines applied to the prompt, already readable. */
  directives: string[];
  /** The compiled prompt actually sent to the model; long on branded runs. */
  compiled: string;
  createdAt?: string;
  credits: number | null;
  enhanced: string;
  error: string;
  /** Width / height of the asset, so the thumbnail keeps its aspect ratio. */
  aspectRatio: number;
  id: string;
  kind: GenerationKind;
  mediaKind: GenerationMediaKind;
  mediaUrl: string;
  model: string;
  negative: string;
  organizationLabel: string;
  original: string;
  status: string;
  userLabel: string;
}

export interface GenerationStatusOption {
  label: string;
  value: string;
}

export interface GenerationFilterDropdownProps {
  label: string;
  onChange: (value: string) => void;
  options: GenerationStatusOption[];
  value: string;
}

export interface GenerationRowProps {
  generation: GenerationView;
  onOpen: (generation: GenerationView) => void;
}

export interface GenerationDetailSheetProps {
  generation: GenerationView | null;
  onClose: () => void;
}

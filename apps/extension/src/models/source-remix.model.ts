import type {
  BrandRemixDraftEdits,
  BrandRemixRunView,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import type { ImportedSourceView } from '~models/imported-source.model';

export type { BrandRemixDraftEdits, BrandRemixRunView };

/** A registered image model the user can pick before a quote. */
export interface SourceRemixImageModel {
  key: string;
  label: string;
  provider?: string;
}

export interface SourceRemixPanelProps {
  onClose: () => void;
  source: ImportedSourceView;
}

/** The part of a remix request the panel can change before any quote. */
export type SourceRemixEdits = BrandRemixDraftEdits;

export interface SourceRemixDraftViewProps {
  isBusy: boolean;
  model: string;
  models: SourceRemixImageModel[];
  onEdit: (edits: SourceRemixEdits) => void;
  onModelChange: (model: string) => void;
  onQuote: () => void;
  run: BrandRemixRunView;
}

export interface SourceRemixQuoteViewProps {
  isBusy: boolean;
  onApprove: () => void;
  onChange: () => void;
  run: BrandRemixRunView;
}

export interface SourceRemixResultViewProps {
  isBusy: boolean;
  onCopy: (text: string) => void;
  onOpenStudio: () => void;
  onRemixAgain: () => void;
  run: BrandRemixRunView;
  sourceTitle: string;
}

import type { IVisualCodeSettings } from '@genfeedai/contracts/interfaces';
import type { VisualCodeQuoteReview } from './visual-code.props';

/** One Library asset the author may reference from Motion source. */
export interface MotionLibraryAssetOption {
  id: string;
  label: string;
}

export type MotionSettingKey = keyof IVisualCodeSettings;

/** The settings popover of the Motion prompt bar: size, props, assets and outputs. */
export interface MotionAdvancedSettingsProps {
  assetIds: string[];
  formats: string[];
  frames: string;
  /** Formats of the project's current revision; shown when exporting. */
  inheritedOutputs?: string;
  /** A project keeps its settings; only exports and revisions change outputs. */
  isProject: boolean;
  libraryAssets: MotionLibraryAssetOption[];
  onAssetToggle: (assetId: string, isChecked: boolean) => void;
  onFormatToggle: (format: string, isChecked: boolean) => void;
  onFramesChange: (frames: string) => void;
  onPropsTextChange: (propsText: string) => void;
  onSettingChange: (key: MotionSettingKey, value: number) => void;
  propsText: string;
  settings: IVisualCodeSettings;
}

/** The credit-ceiling approval shown inside the Motion prompt bar. */
export interface MotionQuoteReviewProps {
  isAcknowledged: boolean;
  isBusy: boolean;
  isVisionUnverified: boolean;
  onAcknowledgedChange: (isAcknowledged: boolean) => void;
  onConfirm: () => void;
  review: VisualCodeQuoteReview;
}

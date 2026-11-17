import type { BrandVideoFinishingV1 } from '@genfeedai/contracts/api-types/contracts';
import type {
  IAsset,
  IBrand,
  IBrandKitDraft,
} from '@genfeedai/contracts/interfaces';
import type { BrandVideoRulesV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

export interface BrandVideoIdentityEditorProps {
  video: BrandVideoRulesV1 | undefined;
  isDisabled: boolean;
  onChange: (video: BrandVideoRulesV1) => void;
}

export interface BrandVideoRuleListProps {
  label: string;
  addLabel: string;
  rules: readonly string[];
  maxRules: number;
  isDisabled: boolean;
  onChange: (rules: string[]) => void;
}

export interface BrandVideoFinishingEditorProps {
  brand: IBrand;
  brandId: string;
  finishing: BrandVideoFinishingV1;
  isDisabled: boolean;
  onChange: (finishing: BrandVideoFinishingV1) => void;
  onRefreshBrand: () => Promise<void>;
}

export interface BrandVideoLogoSelectProps {
  assets: IAsset[];
  brand: IBrand;
  id: string;
  isDisabled: boolean;
  label: string;
  /** Text for the empty choice: no logo, or the default mark. */
  noneLabel: string;
  onChange: (logoId: string) => void;
  value: string;
}

export interface BrandVideoTabProps {
  brand: IBrand;
  brandId: string;
  content: IBrandKitDraft | null;
  isDisabled: boolean;
  onVideoChange: (video: BrandVideoRulesV1) => void;
  onFinishingChange: (finishing: BrandVideoFinishingV1) => void;
  onRefreshBrand: () => Promise<void>;
}

export interface BrandVideoFramePreviewProps {
  video: BrandVideoRulesV1 | undefined;
  finishing: BrandVideoFinishingV1;
  brand: IBrand;
}

export interface BrandVideoRevisionDiffProps {
  approved: IBrandKitDraft | null;
  draft: IBrandKitDraft;
  /** The brand's current finishing, the baseline for a revision that predates finishing. */
  finishingBaseline?: BrandVideoFinishingV1;
}

export type BrandVideoKitValue = string | number | boolean | string[] | null;

export interface BrandVideoKitChange {
  group: 'video' | 'finishing';
  key: string;
  before: BrandVideoKitValue;
  after: BrandVideoKitValue;
}

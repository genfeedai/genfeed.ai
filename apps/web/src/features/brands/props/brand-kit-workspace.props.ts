import type { IBrand, IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import type { ReactNode } from 'react';
import type { BrandKitRevisionWorkspace } from './brand-os-settings.props';

export interface BrandPreviewSocialLink {
  platform: string;
  url: string;
}

export interface BrandPreviewColor {
  key: 'background' | 'primary' | 'secondary';
  value: string;
}

export type BrandPreviewTemplate = 'cover' | 'profile' | 'social';

export interface BrandPreviewSurfaceProps {
  colors: readonly BrandPreviewColor[];
  description: string;
  fontFamily: string;
  label: string;
  logoUrl: string | undefined;
  sample: string;
  slug: string;
  socialLinks: readonly BrandPreviewSocialLink[];
  template: BrandPreviewTemplate;
}

export interface BrandKitLocalPreviewProps {
  brand: IBrand;
  content: IBrandKitDraft | null;
  approvedContent: IBrandKitDraft | null;
}

export interface BrandKitWorkspaceProps extends BrandKitRevisionWorkspace {
  brand: IBrand;
  onScan: () => void;
  onManualImport: () => void;
  onRefreshBrand: () => Promise<void>;
  guidedSetupHref: string;
  contentRulesHref: string;
  /** What is missing and how to import a draft; shown above the sections. */
  overview: ReactNode;
  /** The live agent profile's voice fields. */
  voiceEditor: ReactNode;
  /** The live agent profile's strategy fields. */
  strategyEditor: ReactNode;
  /** Logos, platform images, fonts, kit file and references. */
  assets: ReactNode;
}

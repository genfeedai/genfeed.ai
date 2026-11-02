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

export type BrandPreviewSource = 'approved' | 'draft';

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

export interface BrandKitSectionTabs {
  activeTab: string;
  ariaLabel: string;
  fullWidth: boolean;
  onTabChange: (tab: string) => void;
  tabs: { id: string; label: string }[];
}

export interface BrandKitIconActionsProps {
  guidedSetupHref: string;
  isDisabled: boolean;
  onManualImport: () => void;
  onScan: () => void;
}

export interface BrandKitLocalPreviewProps {
  brand: IBrand;
  content: IBrandKitDraft | null;
  approvedContent: IBrandKitDraft | null;
  source: BrandPreviewSource;
  template: BrandPreviewTemplate;
}

export interface BrandKitPreviewMenuProps {
  isApprovedAvailable: boolean;
  onSourceChange: (source: BrandPreviewSource) => void;
  onTemplateChange: (template: BrandPreviewTemplate) => void;
  source: BrandPreviewSource;
  template: BrandPreviewTemplate;
}

export interface BrandKitWorkspaceProps extends BrandKitRevisionWorkspace {
  brand: IBrand;
  tab: string;
  onScan: () => void;
  onManualImport: () => void;
  guidedSetupHref: string;
  overview: ReactNode;
  writingEditor: ReactNode;
  assets: ReactNode;
}

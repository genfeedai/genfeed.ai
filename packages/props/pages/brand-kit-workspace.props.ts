import type { IBrand, IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import type { ReactNode } from 'react';
import type { BrandKitRevisionWorkspace } from './brand-os-settings.props';

export interface BrandKitLocalPreviewProps {
  brand: IBrand;
  content: IBrandKitDraft | null;
  approvedContent: IBrandKitDraft | null;
}

export interface BrandKitWorkspaceProps extends BrandKitRevisionWorkspace {
  brand: IBrand;
  tab: string;
  onTabChange: (tab: string) => void;
  onScan: () => void;
  onManualImport: () => void;
  guidedSetupHref: string;
  contentRulesHref: string;
  overview: ReactNode;
  writingEditor: ReactNode;
  assets: ReactNode;
}

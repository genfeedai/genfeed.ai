import type { BrandFontAssetReadV1 } from '@genfeedai/contracts/api-types/contracts/brand-font-asset.contract';

export interface BrandStyleFieldEditorProps {
  brandId: string;
  label: string;
  value: unknown;
  isDisabled: boolean;
  onChange: (value: unknown) => void;
}

export interface BrandFontsCardProps {
  brandId: string;
  isManager: boolean;
}

export interface BrandFontPreviewProps {
  font: BrandFontAssetReadV1;
  /** The CSS family the font is registered under, once it has loaded. */
  cssFamily: string | undefined;
  text: string;
}

export interface UseBrandFontsResult {
  fonts: BrandFontAssetReadV1[];
  isLoading: boolean;
  hasError: boolean;
  /** CSS family per font asset id, for fonts that loaded in this page. */
  cssFamilies: Readonly<Record<string, string>>;
  reload: () => void;
}

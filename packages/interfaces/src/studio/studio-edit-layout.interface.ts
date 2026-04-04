import type { IngredientCategory } from '@genfeedai/enums';
import type { ReactNode } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { IAsset, IEditFormData } from '../index';

export interface StudioEditLayoutProps {
  // Form and submission
  form: UseFormReturn<IEditFormData>;
  onSubmit: (formData: IEditFormData) => Promise<void>;
  isProcessing: boolean;
  // Layout and navigation
  children: ReactNode;
  onBack?: () => void;
  title?: string;
  // Asset management
  assets: IAsset[];
  selectedAsset: IAsset | null;
  onAssetSelect: (asset: IAsset) => void;
  onAssetDeselect: () => void;
  // Category management
  categoryType: IngredientCategory;
  onCategoryChange: (category: IngredientCategory) => void;
}

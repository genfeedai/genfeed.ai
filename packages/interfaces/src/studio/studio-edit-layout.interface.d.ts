import type { IngredientCategory } from '@genfeedai/enums';
import type { ReactNode } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { IAsset, IEditFormData } from '../index';
export interface StudioEditLayoutProps {
    form: UseFormReturn<IEditFormData>;
    onSubmit: (formData: IEditFormData) => Promise<void>;
    isProcessing: boolean;
    children: ReactNode;
    onBack?: () => void;
    title?: string;
    assets: IAsset[];
    selectedAsset: IAsset | null;
    onAssetSelect: (asset: IAsset) => void;
    onAssetDeselect: () => void;
    categoryType: IngredientCategory;
    onCategoryChange: (category: IngredientCategory) => void;
}
//# sourceMappingURL=studio-edit-layout.interface.d.ts.map
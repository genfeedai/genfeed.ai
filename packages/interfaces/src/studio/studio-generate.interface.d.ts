import type { ReactNode } from 'react';
import type { IIngredient, IQueryParams } from '../index';
export interface FormDropdownOption {
    key: string | number;
    label: string;
    description?: string;
    thumbnailUrl?: string;
    badge?: string;
    badgeVariant?: 'primary' | 'secondary' | 'accent' | 'info' | 'success' | 'warning' | 'error';
    icon?: ReactNode;
    group?: string;
}
export interface AssetQueryService {
    findAll(query: IQueryParams): Promise<IIngredient[]>;
    findOne(id: string): Promise<IIngredient | null>;
}
export type BadgeVariant = 'error' | 'info' | 'primary' | 'secondary' | 'accent' | 'success' | 'warning';
export interface AvatarVoiceOption extends FormDropdownOption {
    description: string;
    badge: string;
    badgeVariant?: BadgeVariant;
}
export interface AvatarVoiceData {
    avatars: IIngredient[];
    voices: IIngredient[];
}
export type ProviderVariant = 'secondary' | 'accent';
//# sourceMappingURL=studio-generate.interface.d.ts.map
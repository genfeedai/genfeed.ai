'use client';

import type { IAvatar } from '@genfeedai/interfaces';
import SelectedAvatarPreview from '@ui/display/selected-avatar-preview/SelectedAvatarPreview';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { getIngredientDisplayLabel } from '@utils/media/ingredient-type.util';

type BrandIdentityAvatarFieldProps = {
  avatars: IAvatar[];
  selectedAvatarId: string;
  selectedAvatar: IAvatar | null;
  isLoadingAvatars: boolean;
  onAvatarChange: (value: string) => void;
};

export default function BrandIdentityAvatarField({
  avatars,
  selectedAvatarId,
  selectedAvatar,
  isLoadingAvatars,
  onAvatarChange,
}: BrandIdentityAvatarFieldProps) {
  return (
    <div>
      <label
        htmlFor="brand-default-avatar"
        className="mb-1 block text-sm font-medium"
      >
        Default Avatar
      </label>
      <Select
        disabled={isLoadingAvatars}
        onValueChange={(value) => onAvatarChange(value === 'none' ? '' : value)}
        value={selectedAvatarId || 'none'}
      >
        <SelectTrigger
          id="brand-default-avatar"
          className="w-full"
          data-testid="brand-default-avatar-trigger"
        >
          <SelectValue
            placeholder={
              isLoadingAvatars
                ? 'Loading avatars...'
                : 'Select a saved avatar for this brand'
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Use organization fallback</SelectItem>
          {avatars.map((avatar) => (
            <SelectItem key={avatar.id} value={avatar.id}>
              {getIngredientDisplayLabel(avatar)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedAvatar ? (
        <SelectedAvatarPreview
          description="Leave empty to inherit the organization avatar."
          imageAlt={
            getIngredientDisplayLabel(selectedAvatar) || 'Selected avatar'
          }
          imageUrl={
            selectedAvatar.ingredientUrl || '/placeholders/portrait.jpg'
          }
          title={getIngredientDisplayLabel(selectedAvatar) || 'Selected avatar'}
          wrapperClassName="mt-3"
        />
      ) : null}
    </div>
  );
}

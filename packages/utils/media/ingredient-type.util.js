import { IngredientCategory, IngredientExtension } from '@genfeedai/enums';
const AVATAR_IMAGE_EXTENSIONS = new Set([IngredientExtension.JPG, 'jpeg']);
function getNormalizedMetadataExtension(ingredient) {
    if (!ingredient) {
        return null;
    }
    const metadata = ingredient.metadata;
    const extension = ingredient.metadataExtension ?? metadata?.extension;
    return typeof extension === 'string' ? extension.toLowerCase() : null;
}
export function isAvatarIngredient(ingredient) {
    return ingredient?.category === IngredientCategory.AVATAR;
}
export function isAvatarSourceImageIngredient(ingredient) {
    return (isAvatarIngredient(ingredient) &&
        AVATAR_IMAGE_EXTENSIONS.has(getNormalizedMetadataExtension(ingredient) ?? ''));
}
export function isAvatarVideoIngredient(ingredient) {
    return (isAvatarIngredient(ingredient) &&
        getNormalizedMetadataExtension(ingredient) === IngredientExtension.MP4);
}
export function isVideoIngredient(ingredient) {
    if (!ingredient) {
        return false;
    }
    return (ingredient.category === IngredientCategory.VIDEO ||
        isAvatarVideoIngredient(ingredient));
}
export function isImageIngredient(ingredient) {
    if (!ingredient) {
        return false;
    }
    return (ingredient.category === IngredientCategory.IMAGE ||
        ingredient.category === IngredientCategory.GIF ||
        isAvatarSourceImageIngredient(ingredient));
}
export function getIngredientExtension(ingredient) {
    if (isVideoIngredient(ingredient)) {
        return 'mp4';
    }
    if (ingredient.category === IngredientCategory.GIF) {
        return 'gif';
    }
    if (isImageIngredient(ingredient)) {
        return 'jpg';
    }
    if (ingredient.category === IngredientCategory.MUSIC ||
        ingredient.category === IngredientCategory.VOICE) {
        return 'mp3';
    }
    return 'bin';
}
export function getIngredientDisplayLabel(ingredient) {
    if (!ingredient) {
        return '';
    }
    const metadata = ingredient.metadata;
    return ingredient.metadataLabel ?? metadata?.label ?? ingredient.id;
}
//# sourceMappingURL=ingredient-type.util.js.map
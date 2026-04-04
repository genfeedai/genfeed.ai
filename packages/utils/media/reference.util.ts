import type { IAsset } from '@cloud/interfaces';
import { EnvironmentService } from '@services/core/environment.service';

/**
 * Resolve the primary reference image URL for an ingredient.
 */
export function resolveIngredientReferenceUrl(
  references?: Array<IAsset | string> | IAsset | string | null,
): string | null {
  if (!references) {
    return null;
  }

  const firstReference = Array.isArray(references) ? references[0] : references;
  if (!firstReference) {
    return null;
  }

  if (typeof firstReference === 'string') {
    return `${EnvironmentService.ingredientsEndpoint}/images/${firstReference}`;
  }

  const { url, id } = firstReference;

  if (typeof url === 'string' && url.trim().length > 0) {
    if (url.startsWith('http')) {
      return url;
    }

    const normalized = url.replace(/^\/+/, '');

    if (
      normalized.startsWith('images/') ||
      normalized.startsWith('references/')
    ) {
      return `${EnvironmentService.ingredientsEndpoint}/${normalized}`;
    }

    if (normalized.startsWith('ingredients/')) {
      return `${EnvironmentService.cdnUrl}/${normalized}`;
    }

    return `${EnvironmentService.ingredientsEndpoint}/images/${normalized}`;
  }

  if (id && id.trim().length > 0) {
    return `${EnvironmentService.ingredientsEndpoint}/images/${id}`;
  }

  return null;
}

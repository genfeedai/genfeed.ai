import type { IMetadata } from '@genfeedai/interfaces';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import type React from 'react';

export function getAspectRatioStyle(
  isSquare: boolean,
  metadata: IMetadata | undefined,
): React.CSSProperties | undefined {
  if (isSquare || !metadata?.width || !metadata?.height) {
    return undefined;
  }
  return { aspectRatio: `${metadata.width} / ${metadata.height}` };
}

export function getImageSrc(
  ingredientUrl: string | undefined,
  hasError: boolean,
): string {
  const isInvalidUrl = hasError || !ingredientUrl || ingredientUrl === '';
  if (isInvalidUrl) {
    return `${EnvironmentService.assetsEndpoint}/placeholders/portrait.jpg`;
  }
  return ingredientUrl;
}

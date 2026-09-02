import type { IMetadata } from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import type React from 'react';

export function getAspectRatioStyle(
  isSquare: boolean,
  metadata: Pick<IMetadata, 'height' | 'width'> | undefined,
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

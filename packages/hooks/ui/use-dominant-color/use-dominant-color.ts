'use client';

import { useEffect, useState } from 'react';

export interface DominantColor {
  r: number;
  g: number;
  b: number;
  /** CSS-ready `rgb(r g b)` string derived from the sampled pixels. */
  rgb: string;
}

export interface UseDominantColorOptions {
  /** Edge length (px) of the square offscreen canvas the image is drawn onto before sampling. */
  sampleSize?: number;
  /** Pixels below this alpha (0-255) are ignored so transparent padding does not muddy the result. */
  minAlpha?: number;
}

const DEFAULT_SAMPLE_SIZE = 24;
const DEFAULT_MIN_ALPHA = 16;

/**
 * Client-side dominant-color extraction for a single media URL.
 *
 * Draws the image onto a tiny offscreen canvas and returns a saturation-weighted
 * average so a vivid subject reads through a neutral background. Purely for the
 * ambient content wash — colour is derived FROM focused content, never imposed on
 * chrome (see DESIGN.md → "Color Entry — Content Is the Accent").
 *
 * Degrades gracefully to `null` when:
 * - no URL is provided,
 * - running on the server / without canvas support,
 * - the image fails to load, or
 * - the canvas is tainted by a cross-origin image without CORS headers.
 */
export function useDominantColor(
  imageUrl: string | null | undefined,
  options: UseDominantColorOptions = {},
): DominantColor | null {
  const { sampleSize = DEFAULT_SAMPLE_SIZE, minAlpha = DEFAULT_MIN_ALPHA } =
    options;

  const [color, setColor] = useState<DominantColor | null>(null);

  useEffect(() => {
    if (!imageUrl || typeof window === 'undefined') {
      setColor(null);
      return;
    }

    let isCancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';

    const handleLoad = () => {
      if (isCancelled) {
        return;
      }

      const extracted = extractDominantColor(image, sampleSize, minAlpha);
      if (!isCancelled) {
        setColor(extracted);
      }
    };

    const handleError = () => {
      if (!isCancelled) {
        setColor(null);
      }
    };

    image.addEventListener('load', handleLoad);
    image.addEventListener('error', handleError);
    image.src = imageUrl;

    return () => {
      isCancelled = true;
      image.removeEventListener('load', handleLoad);
      image.removeEventListener('error', handleError);
    };
  }, [imageUrl, sampleSize, minAlpha]);

  return color;
}

function extractDominantColor(
  image: HTMLImageElement,
  sampleSize: number,
  minAlpha: number,
): DominantColor | null {
  const canvas = document.createElement('canvas');
  canvas.width = sampleSize;
  canvas.height = sampleSize;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return null;
  }

  context.drawImage(image, 0, 0, sampleSize, sampleSize);

  let pixels: Uint8ClampedArray;
  try {
    pixels = context.getImageData(0, 0, sampleSize, sampleSize).data;
  } catch {
    // Cross-origin image without CORS headers taints the canvas — bail silently.
    return null;
  }

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let weightSum = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] ?? 0;
    if (alpha < minAlpha) {
      continue;
    }

    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;

    // Favour opaque, saturated pixels so the subject's hue survives a neutral field.
    const weight = (alpha / 255) * (1 + saturation * 3);

    rSum += r * weight;
    gSum += g * weight;
    bSum += b * weight;
    weightSum += weight;
  }

  if (weightSum === 0) {
    return null;
  }

  const r = Math.round(rSum / weightSum);
  const g = Math.round(gSum / weightSum);
  const b = Math.round(bSum / weightSum);

  return { b, g, r, rgb: `rgb(${r} ${g} ${b})` };
}

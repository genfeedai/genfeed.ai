import { IngredientFormat } from '@genfeedai/contracts';
import { HttpException, HttpStatus } from '@nestjs/common';

export function resolveInterpolationDuration(duration?: number): number {
  if (!Number.isFinite(duration ?? 5) || (duration || 5) <= 0) {
    throw new HttpException(
      'Interpolation duration must be finite and positive',
      HttpStatus.BAD_REQUEST,
    );
  }
  return duration || 5;
}

export function resolveInterpolationDimensions(format: IngredientFormat): {
  height: number;
  width: number;
} {
  if (format === IngredientFormat.PORTRAIT) {
    return { height: 1280, width: 720 };
  }
  if (format === IngredientFormat.SQUARE) {
    return { height: 1080, width: 1080 };
  }
  return { height: 720, width: 1280 };
}

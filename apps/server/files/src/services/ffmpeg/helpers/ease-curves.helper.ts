import { VideoEaseCurve } from '@genfeedai/enums';

/**
 * Generate FFmpeg expression for ease curve functions
 * @param easeCurve The ease curve type
 * @param tVariable The variable name representing normalized time (0-1), typically 't' or 'on/duration'
 * @returns FFmpeg expression string for the ease curve
 */
export function getEaseCurveExpression(
  easeCurve: VideoEaseCurve,
  tVariable: string = 't',
): string {
  switch (easeCurve) {
    case VideoEaseCurve.EASE_IN_OUT_EXPO:
      // Ease-in-out exponential: smooth start and end
      return `if(lt(${tVariable},0.5),pow(2,20*${tVariable}-10)/2,(2-pow(2,-20*${tVariable}+10))/2)`;

    case VideoEaseCurve.EASE_IN_EXPO_OUT_CUBIC:
      // Ease-in exponential, ease-out cubic: fast start, smooth end
      return `if(lt(${tVariable},0.5),pow(2,20*${tVariable}-10)/2,1-pow(-2*${tVariable}+2,3)/2)`;

    case VideoEaseCurve.EASE_IN_QUART_OUT_QUAD:
      // Ease-in quart, ease-out quad: very smooth start, gentle end
      return `if(lt(${tVariable},0.5),16*pow(${tVariable},4),1-pow(-2*${tVariable}+2,2)/2)`;

    case VideoEaseCurve.EASE_IN_OUT_CUBIC:
      // Ease-in-out cubic: balanced smooth curve
      return `if(lt(${tVariable},0.5),4*pow(${tVariable},3),1-pow(-2*${tVariable}+2,3)/2)`;

    case VideoEaseCurve.EASE_IN_OUT_SINE:
      // Ease-in-out sine: natural, organic feel
      return `-(cos(PI*${tVariable})-1)/2`;

    default:
      // Linear fallback
      return tVariable;
  }
}

/**
 * Generate zoom expression with ease curve
 * @param startZoom Starting zoom level
 * @param endZoom Ending zoom level
 * @param easeCurve The ease curve to apply
 * @param tVariable The variable name representing normalized time
 * @returns FFmpeg expression for zoom with easing
 */
export function getZoomExpression(
  startZoom: number,
  endZoom: number,
  easeCurve: VideoEaseCurve,
  tVariable: string = 'on/duration',
): string {
  const easeExpr = getEaseCurveExpression(easeCurve, tVariable);
  const zoomDiff = endZoom - startZoom;
  return `${startZoom}+${zoomDiff}*(${easeExpr})`;
}

/**
 * Generate pan expression with ease curve
 * @param startPos Starting position (0-1)
 * @param endPos Ending position (0-1)
 * @param dimensionSize Dimension size (width or height)
 * @param easeCurve The ease curve to apply
 * @param tVariable The variable name representing normalized time
 * @returns FFmpeg expression for panning with easing
 */
export function getPanExpression(
  startPos: number,
  endPos: number,
  dimensionSize: string,
  easeCurve: VideoEaseCurve,
  tVariable: string = 'on/duration',
): string {
  const easeExpr = getEaseCurveExpression(easeCurve, tVariable);
  const posDiff = endPos - startPos;
  // Convert normalized position (0-1) to pixel position
  return `${dimensionSize}*(${startPos}+${posDiff}*(${easeExpr}))`;
}

/**
 * Generate blend expression for transitions with ease curve
 * @param easeCurve The ease curve to apply
 * @param tVariable The variable name representing normalized time (0-1)
 * @returns FFmpeg expression for blending with easing
 */
export function getBlendExpression(
  easeCurve: VideoEaseCurve,
  tVariable: string = 't',
): string {
  const easeExpr = getEaseCurveExpression(easeCurve, tVariable);
  // A is first video, B is second video
  // Blend: A*(1-ease) + B*ease
  return `A*(1-(${easeExpr}))+B*(${easeExpr})`;
}

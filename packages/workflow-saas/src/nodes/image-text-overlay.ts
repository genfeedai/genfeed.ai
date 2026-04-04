/**
 * Image Text Overlay Node
 *
 * SAAS category node that renders text onto a static image (PNG/JPEG)
 * using Sharp. Specifically designed for burning hook text onto slide 1
 * of a TikTok slideshow for maximum engagement.
 */

import type { BaseNodeData } from '@workflow-saas/types';

/**
 * Vertical position of the text overlay on the image
 */
export type TextPosition = 'top' | 'center' | 'bottom';

/**
 * Horizontal alignment of the text overlay
 */
export type TextAlignment = 'left' | 'center' | 'right';

/**
 * Style configuration for text overlay rendering
 */
export interface TextOverlayStyle {
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold' | 'black';
  color: string;
  strokeColor: string;
  strokeWidth: number;
  position: TextPosition;
  alignment: TextAlignment;
  paddingX: number;
  paddingY: number;
  maxWidthPercent: number;
  lineHeight: number;
}

/**
 * Default style optimized for TikTok readability:
 * large white text with black stroke for contrast against any background
 */
export const DEFAULT_TEXT_OVERLAY_STYLE: TextOverlayStyle = {
  alignment: 'center',
  color: '#FFFFFF',
  fontFamily: 'Montserrat',
  fontSize: 72,
  fontWeight: 'black',
  lineHeight: 1.2,
  maxWidthPercent: 90,
  paddingX: 40,
  paddingY: 60,
  position: 'center',
  strokeColor: '#000000',
  strokeWidth: 3,
};

/**
 * Image Text Overlay Node Data
 *
 * Inputs:
 * - image (image): Image to overlay text on (required)
 * - text (text): Text to render, typically from HookGenerator (required)
 *
 * Outputs:
 * - image (image): Image with text burned in
 */
export interface ImageTextOverlayNodeData extends BaseNodeData {
  type: 'imageTextOverlay';

  // Input from connections
  inputImageUrl: string | null;
  inputText: string | null;

  // Configuration
  style: TextOverlayStyle;
  slideIndex: number;

  // Output
  outputImageUrl: string | null;

  // Job state
  jobId: string | null;
}

/**
 * Default data for a new Image Text Overlay node
 */
export const DEFAULT_IMAGE_TEXT_OVERLAY_DATA: Partial<ImageTextOverlayNodeData> =
  {
    inputImageUrl: null,
    inputText: null,
    jobId: null,
    label: 'Image Text Overlay',
    outputImageUrl: null,
    slideIndex: 0,
    status: 'idle',
    style: { ...DEFAULT_TEXT_OVERLAY_STYLE },
    type: 'imageTextOverlay',
  };

/**
 * Image Text Overlay node definition for registry
 */
export const imageTextOverlayNodeDefinition = {
  category: 'saas' as const,
  defaultData: DEFAULT_IMAGE_TEXT_OVERLAY_DATA,
  description:
    'Burn text overlay onto static images for TikTok slideshow hooks',
  icon: 'Type',
  inputs: [
    { id: 'image', label: 'Image', required: true, type: 'image' },
    { id: 'text', label: 'Text', required: true, type: 'text' },
  ],
  label: 'Image Text Overlay',
  outputs: [{ id: 'image', label: 'Image with Text', type: 'image' }],
  type: 'imageTextOverlay',
};

import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Circle, MousePointer, Pencil, Square, Type } from 'lucide-react';
import type { AnnotationTool } from '@genfeedai/workflow-ui/stores';

/**
 * Tool configuration for the annotation toolbar
 */
export const TOOLS: { tool: AnnotationTool; icon: LucideIcon; label: string }[] = [
  { icon: MousePointer, label: 'Select', tool: 'select' },
  { icon: Square, label: 'Rectangle', tool: 'rectangle' },
  { icon: Circle, label: 'Circle', tool: 'circle' },
  { icon: ArrowRight, label: 'Arrow', tool: 'arrow' },
  { icon: Pencil, label: 'Freehand', tool: 'freehand' },
  { icon: Type, label: 'Text', tool: 'text' },
];

/**
 * Color palette for annotations
 */
export const COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#ffffff', // White
  '#000000', // Black
];

/**
 * Available stroke widths
 */
export const STROKE_WIDTHS = [2, 3, 5, 8];

/**
 * Available font sizes for text annotations
 */
export const FONT_SIZES = [12, 14, 16, 20, 24, 32, 48];

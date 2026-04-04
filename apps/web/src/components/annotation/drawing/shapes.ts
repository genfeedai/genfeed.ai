import type { AnnotationShape } from '@genfeedai/workflow-ui/stores';

/**
 * Canvas state for transformations
 */
export interface CanvasState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Draw a shape on the canvas
 */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: AnnotationShape | Partial<AnnotationShape>,
  isSelected: boolean = false
): void {
  ctx.strokeStyle = shape.strokeColor ?? '#ef4444';
  ctx.lineWidth = shape.strokeWidth ?? 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (shape.fillColor) {
    ctx.fillStyle = shape.fillColor;
  }

  switch (shape.type) {
    case 'rectangle': {
      const s = shape as { x: number; y: number; width: number; height: number };
      if (shape.fillColor) {
        ctx.fillRect(s.x, s.y, s.width, s.height);
      }
      ctx.strokeRect(s.x, s.y, s.width, s.height);
      break;
    }
    case 'circle': {
      const s = shape as { x: number; y: number; radius: number };
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      if (shape.fillColor) {
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
    case 'arrow': {
      const s = shape as { points: number[] };
      if (s.points.length >= 4) {
        const [x1, y1, x2, y2] = s.points;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Draw arrowhead
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLength = 15;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - headLength * Math.cos(angle - Math.PI / 6),
          y2 - headLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - headLength * Math.cos(angle + Math.PI / 6),
          y2 - headLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      }
      break;
    }
    case 'freehand': {
      const s = shape as { points: number[] };
      if (s.points.length >= 4) {
        ctx.beginPath();
        ctx.moveTo(s.points[0], s.points[1]);
        for (let i = 2; i < s.points.length; i += 2) {
          ctx.lineTo(s.points[i], s.points[i + 1]);
        }
        ctx.stroke();
      }
      break;
    }
    case 'text': {
      const s = shape as { x: number; y: number; text: string; fontSize: number };
      ctx.font = `${s.fontSize ?? 16}px sans-serif`;
      ctx.fillStyle = shape.strokeColor ?? '#ef4444';
      ctx.fillText(s.text, s.x, s.y);
      break;
    }
  }

  // Draw selection indicator
  if (isSelected) {
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    const bounds = getShapeBounds(shape);
    if (bounds) {
      ctx.strokeRect(bounds.x - 5, bounds.y - 5, bounds.width + 10, bounds.height + 10);
    }
    ctx.setLineDash([]);
  }
}

/**
 * Get the bounding box of a shape
 */
export function getShapeBounds(
  shape: AnnotationShape | Partial<AnnotationShape>
): { x: number; y: number; width: number; height: number } | null {
  switch (shape.type) {
    case 'rectangle': {
      const s = shape as { x: number; y: number; width: number; height: number };
      return { height: s.height, width: s.width, x: s.x, y: s.y };
    }
    case 'circle': {
      const s = shape as { x: number; y: number; radius: number };
      return { height: s.radius * 2, width: s.radius * 2, x: s.x - s.radius, y: s.y - s.radius };
    }
    case 'arrow':
    case 'freehand': {
      const s = shape as { points: number[] };
      if (!s.points || s.points.length < 2) return null;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (let i = 0; i < s.points.length; i += 2) {
        minX = Math.min(minX, s.points[i]);
        maxX = Math.max(maxX, s.points[i]);
        minY = Math.min(minY, s.points[i + 1]);
        maxY = Math.max(maxY, s.points[i + 1]);
      }
      return { height: maxY - minY, width: maxX - minX, x: minX, y: minY };
    }
    case 'text': {
      const s = shape as { x: number; y: number; text: string; fontSize: number };
      return {
        height: s.fontSize ?? 16,
        width: s.text.length * 10,
        x: s.x,
        y: s.y - (s.fontSize ?? 16),
      };
    }
    default:
      return null;
  }
}

/**
 * Check if a point is inside a shape's bounding box
 */
export function isPointInShape(
  x: number,
  y: number,
  shape: AnnotationShape | Partial<AnnotationShape>
): boolean {
  const bounds = getShapeBounds(shape);
  if (!bounds) return false;
  const padding = 10;
  return (
    x >= bounds.x - padding &&
    x <= bounds.x + bounds.width + padding &&
    y >= bounds.y - padding &&
    y <= bounds.y + bounds.height + padding
  );
}

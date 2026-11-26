'use client';

import type {
  AnnotationShapeData,
  NormalizedPoint,
  TrajectoryPoint,
} from '@genfeedai/contracts/types';
import Image from 'next/image';
import { useState } from 'react';

const VIEW_WIDTH = 1000;
const DEFAULT_ASPECT = 16 / 9;

interface GeometryThumbProps {
  points?: TrajectoryPoint[];
  shapes?: AnnotationShapeData[];
  src: string;
}

function toPolyline(
  points: readonly NormalizedPoint[],
  viewHeight: number,
): string {
  return points
    .map((point) => `${point.x * VIEW_WIDTH},${point.y * viewHeight}`)
    .join(' ');
}

/** The saved geometry over its image, read-only, sized to the image's own aspect. */
export default function GeometryThumb({
  points,
  shapes,
  src,
}: GeometryThumbProps) {
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);
  const viewHeight = Math.round(VIEW_WIDTH / aspect);
  const common = {
    fill: 'none',
    stroke: 'hsl(var(--destructive))',
    strokeWidth: 2.5,
    vectorEffect: 'non-scaling-stroke' as const,
  };

  return (
    <div
      className="relative w-full overflow-hidden rounded-md border border-border"
      style={{ aspectRatio: String(aspect) }}
    >
      <Image
        alt=""
        className="object-cover"
        fill
        onLoad={(event) => {
          const { naturalHeight, naturalWidth } = event.currentTarget;
          if (naturalWidth > 0 && naturalHeight > 0) {
            setAspect(naturalWidth / naturalHeight);
          }
        }}
        src={src}
        unoptimized
      />
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${VIEW_WIDTH} ${viewHeight}`}
      >
        {points && points.length > 1 ? (
          <polyline
            fill="none"
            points={toPolyline(points, viewHeight)}
            stroke="hsl(var(--primary))"
            strokeDasharray="10 8"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {points?.map((point, index) => (
          <circle
            cx={point.x * VIEW_WIDTH}
            cy={point.y * viewHeight}
            fill="hsl(var(--primary))"
            // biome-ignore lint/suspicious/noArrayIndexKey: path points have no id; their order is their identity
            key={`p${index}`}
            r={9}
          />
        ))}
        {shapes?.map((shape) => {
          if (shape.kind === 'rectangle') {
            return (
              <rect
                {...common}
                height={shape.height * viewHeight}
                key={shape.id}
                width={shape.width * VIEW_WIDTH}
                x={shape.x * VIEW_WIDTH}
                y={shape.y * viewHeight}
              />
            );
          }
          if (shape.kind === 'ellipse') {
            return (
              <ellipse
                {...common}
                cx={(shape.x + shape.width / 2) * VIEW_WIDTH}
                cy={(shape.y + shape.height / 2) * viewHeight}
                key={shape.id}
                rx={(shape.width / 2) * VIEW_WIDTH}
                ry={(shape.height / 2) * viewHeight}
              />
            );
          }
          if (shape.kind === 'text') {
            return (
              <text
                fill="hsl(var(--destructive))"
                fontSize={34}
                fontWeight={700}
                key={shape.id}
                x={shape.x * VIEW_WIDTH}
                y={shape.y * viewHeight}
              >
                {shape.text}
              </text>
            );
          }
          return (
            <polyline
              {...common}
              key={shape.id}
              points={toPolyline(shape.points, viewHeight)}
            />
          );
        })}
      </svg>
    </div>
  );
}

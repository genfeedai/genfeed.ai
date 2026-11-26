'use client';

import type {
  AnnotationShapeData,
  NormalizedPoint,
  TrajectoryPoint,
} from '@genfeedai/contracts/types';
import { useTranslations } from 'next-intl';
import type { GeometryIssue } from '../lib/geometry';

export const VIEW_WIDTH = 1000;
const SHAPE_STROKE = 'hsl(var(--destructive))';
const INVALID_STROKE = 'hsl(38 92% 50%)';
const PATH_STROKE = 'hsl(var(--primary))';

export function pointIdAt(index: number): string {
  return `p${index}`;
}

interface ShapeLayerProps {
  issueById: Map<string, GeometryIssue>;
  selectedShapeId: string | null;
  shapes: AnnotationShapeData[];
  toolCursor: string;
  viewHeight: number;
}

export function ShapeLayer({
  issueById,
  selectedShapeId,
  shapes,
  toolCursor,
  viewHeight,
}: ShapeLayerProps) {
  const translate = useTranslations('pages.workflows.geometryEditor');
  const renderShape = (shape: AnnotationShapeData) => {
    const isSelected = shape.id === selectedShapeId;
    const isInvalid = issueById.has(shape.id);
    const stroke = isInvalid ? INVALID_STROKE : SHAPE_STROKE;
    const common = {
      'data-item': shape.id,
      fill: 'none',
      stroke,
      strokeDasharray: isInvalid ? '8 6' : undefined,
      strokeWidth: isSelected ? 4 : 2.5,
      style: { cursor: toolCursor },
      vectorEffect: 'non-scaling-stroke' as const,
    };
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
          data-item={shape.id}
          fill={stroke}
          fontSize={30}
          fontWeight={isSelected ? 800 : 600}
          key={shape.id}
          style={{ cursor: toolCursor }}
          x={shape.x * VIEW_WIDTH}
          y={shape.y * viewHeight}
        >
          {shape.text || translate('textOnCanvas')}
        </text>
      );
    }
    return (
      <g key={shape.id}>
        <polyline
          {...common}
          points={shape.points
            .map((point) => `${point.x * VIEW_WIDTH},${point.y * viewHeight}`)
            .join(' ')}
        />
        {shape.kind === 'arrow' && shape.points.length >= 2 ? (
          <ArrowHead
            from={shape.points[0]}
            id={shape.id}
            stroke={stroke}
            to={shape.points[shape.points.length - 1]}
            viewHeight={viewHeight}
          />
        ) : null}
      </g>
    );
  };

  return <>{shapes.map(renderShape)}</>;
}

function ArrowHead({
  from,
  id,
  stroke,
  to,
  viewHeight,
}: {
  from: NormalizedPoint;
  id: string;
  stroke: string;
  to: NormalizedPoint;
  viewHeight: number;
}) {
  const angle = Math.atan2(
    (to.y - from.y) * viewHeight,
    (to.x - from.x) * VIEW_WIDTH,
  );
  const size = 22;
  const x = to.x * VIEW_WIDTH;
  const y = to.y * viewHeight;
  const left = `${x - size * Math.cos(angle - 0.45)},${y - size * Math.sin(angle - 0.45)}`;
  const right = `${x - size * Math.cos(angle + 0.45)},${y - size * Math.sin(angle + 0.45)}`;
  return (
    <polyline
      data-item={id}
      fill="none"
      points={`${left} ${x},${y} ${right}`}
      stroke={stroke}
      strokeWidth={2.5}
      vectorEffect="non-scaling-stroke"
    />
  );
}

export function TrajectoryLayer({
  issueById,
  points,
  selectedIndex,
  viewHeight,
}: {
  issueById: Map<string, GeometryIssue>;
  points: TrajectoryPoint[];
  selectedIndex: number;
  viewHeight: number;
}) {
  const line = points
    .map((point) => `${point.x * VIEW_WIDTH},${point.y * viewHeight}`)
    .join(' ');
  return (
    <g>
      {points.length >= 2 ? (
        <polyline
          fill="none"
          points={line}
          pointerEvents="none"
          stroke={PATH_STROKE}
          strokeDasharray="10 8"
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {points.map((point, index) => {
        const id = pointIdAt(index);
        return (
          <g data-item={id} key={id} style={{ cursor: 'grab' }}>
            <circle
              cx={point.x * VIEW_WIDTH}
              cy={point.y * viewHeight}
              fill={issueById.has(id) ? INVALID_STROKE : PATH_STROKE}
              r={index === selectedIndex ? 20 : 16}
              stroke="hsl(var(--background))"
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
            />
            <text
              fill="hsl(var(--primary-foreground))"
              fontSize={18}
              fontWeight={700}
              pointerEvents="none"
              textAnchor="middle"
              x={point.x * VIEW_WIDTH}
              y={point.y * viewHeight + 6}
            >
              {index + 1}
            </text>
          </g>
        );
      })}
    </g>
  );
}

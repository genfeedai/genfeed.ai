'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  AnnotationShapeData,
  TrajectoryPoint,
} from '@genfeedai/contracts/types';
import { Alert } from '@genfeedai/ui/primitives/alert';
import { Badge } from '@genfeedai/ui/primitives/badge';
import { Button } from '@genfeedai/ui/primitives/button';
import { Input } from '@genfeedai/ui/primitives/input';
import { Label } from '@genfeedai/ui/primitives/label';
import { Toggle } from '@genfeedai/ui/primitives/toggle';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { type GeometryIssue, shapeSubject } from '../lib/geometry';
import { pointIdAt } from './GeometryStageLayers';
import { useGeometryMessages } from './useGeometryMessages';

interface GeometryItemListProps {
  isTrajectory: boolean;
  issues: GeometryIssue[];
  onChangeText: (shapeId: string, text: string) => void;
  onDeletePoint: (index: number) => void;
  onDeleteShape: (shape: AnnotationShapeData) => void;
  onSelectPoint: (index: number) => void;
  onSelectShape: (shapeId: string) => void;
  points: TrajectoryPoint[];
  selectedPointIndex: number;
  selectedShapeId: string | null;
  shapes: AnnotationShapeData[];
}

/** A row is a toggle: pressed means selected, which a screen reader hears and the toggle styles. */
const ROW_CLASS = 'min-w-0 flex-1 justify-between';

/** The side list of what is drawn: the shapes or the path points, their problems, and a text field. */
export default function GeometryItemList({
  isTrajectory,
  issues,
  onChangeText,
  onDeletePoint,
  onDeleteShape,
  onSelectPoint,
  onSelectShape,
  points,
  selectedPointIndex,
  selectedShapeId,
  shapes,
}: GeometryItemListProps) {
  const translate = useTranslations('pages.workflows.geometryEditor');
  const { describeIssue, subjectName } = useGeometryMessages();
  const textFieldId = useId();
  const heading = translate(
    isTrajectory ? 'pathHeading' : 'annotationsHeading',
  );
  const issueIds = new Set(issues.map((issue) => issue.id));
  const selectedShape = shapes.find((shape) => shape.id === selectedShapeId);
  const itemCount = isTrajectory ? points.length : shapes.length;

  return (
    <aside
      aria-label={heading}
      className="flex w-full shrink-0 flex-col gap-3 md:w-64"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
        <Badge variant="secondary">
          {isTrajectory
            ? translate('pointCount', { count: points.length })
            : translate('annotationCount', { count: shapes.length })}
        </Badge>
      </div>

      {issues.length > 0 ? (
        <Alert size="sm" variant="destructive">
          <p className="font-medium">{translate('issues.heading')}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
            {issues.map((issue) => (
              <li key={issue.id}>{describeIssue(issue)}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <ul
        className="flex max-h-72 min-h-0 flex-col gap-1 overflow-y-auto"
        data-testid="geometry-items"
      >
        {isTrajectory
          ? points.map((point, index) => (
              <li className="flex items-center gap-1" key={pointIdAt(index)}>
                <Toggle
                  className={ROW_CLASS}
                  onPressedChange={() => onSelectPoint(index)}
                  pressed={selectedPointIndex === index}
                  size="sm"
                >
                  <span>{translate('pointRow', { index: index + 1 })}</span>
                  <span className="text-xs text-muted-foreground">
                    {translate('pointDetail', {
                      frame: point.frame,
                      x: Math.round(point.x * 100),
                      y: Math.round(point.y * 100),
                    })}
                  </span>
                </Toggle>
                <Button
                  ariaLabel={translate('deletePoint', { index: index + 1 })}
                  icon={<Trash2 className="size-3.5" />}
                  onClick={() => onDeletePoint(index)}
                  size={ButtonSize.ICON}
                  textTransform="none"
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                />
              </li>
            ))
          : shapes.map((shape) => {
              const name = subjectName(shapeSubject(shapes, shape));
              return (
                <li className="flex items-center gap-1" key={shape.id}>
                  <Toggle
                    className={ROW_CLASS}
                    onPressedChange={() => onSelectShape(shape.id)}
                    pressed={selectedShapeId === shape.id}
                    size="sm"
                  >
                    <span>{name}</span>
                    {issueIds.has(shape.id) ? (
                      <Badge variant="warning">{translate('fix')}</Badge>
                    ) : null}
                  </Toggle>
                  <Button
                    ariaLabel={translate('deleteShape', { name })}
                    icon={<Trash2 className="size-3.5" />}
                    onClick={() => onDeleteShape(shape)}
                    size={ButtonSize.ICON}
                    textTransform="none"
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  />
                </li>
              );
            })}
        {itemCount === 0 ? (
          <li className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            {translate(isTrajectory ? 'emptyTrajectory' : 'emptyAnnotation')}
          </li>
        ) : null}
      </ul>

      {!isTrajectory && selectedShape?.kind === 'text' ? (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor={textFieldId}>
            {translate('labelText')}
          </Label>
          <Input
            autoFocus
            id={textFieldId}
            onChange={(event) =>
              onChangeText(selectedShape.id, event.target.value)
            }
            placeholder={translate('labelPlaceholder')}
            value={selectedShape.text}
          />
        </div>
      ) : null}
    </aside>
  );
}

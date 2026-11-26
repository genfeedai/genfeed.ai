'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  AnnotationShapeData,
  AnnotationShapeKind,
  NormalizedPoint,
  TrajectoryPoint,
} from '@genfeedai/contracts/types';
import { Button } from '@genfeedai/ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@genfeedai/ui/primitives/dialog';
import { SegmentedControl } from '@genfeedai/ui/primitives/segmented-control';
import { Trash2, Undo2 } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  clamp01,
  type GeometryIssue,
  moveShape,
  shapeSubject,
  toNormalized,
  totalFramesFor,
  validateShapes,
  validateTrajectory,
  withEvenFrames,
} from '../lib/geometry';
import {
  createGeometryHistory,
  geometryHistoryReducer,
} from '../lib/geometryHistory';
import GeometryItemList from './GeometryItemList';
import {
  pointIdAt,
  ShapeLayer,
  TrajectoryLayer,
  VIEW_WIDTH,
} from './GeometryStageLayers';
import { useGeometryToolOptions } from './geometryToolOptions';
import { useGeometryMessages } from './useGeometryMessages';

const KEY_STEP = 0.01;
const KEY_STEP_BIG = 0.05;
const DEFAULT_SIZE = { height: 0.16, width: 0.22 };
const MIN_DRAWN_SIZE = 0.01;
const DEFAULT_ASPECT = 16 / 9;

export type GeometryEditorMode = 'annotation' | 'trajectory';

type Tool = 'select' | AnnotationShapeKind | 'point';

export interface GeometryEditorDialogProps {
  /** Seconds of video the path is spread over (trajectory mode). */
  durationSeconds?: number;
  /** Width over height of the image until it has loaded and reports its own. */
  imageAspect?: number;
  imageSrc: string;
  initialPoints?: TrajectoryPoint[];
  initialShapes?: AnnotationShapeData[];
  mode: GeometryEditorMode;
  onOpenChange: (isOpen: boolean) => void;
  onSavePoints?: (points: TrajectoryPoint[]) => void;
  onSaveShapes?: (shapes: AnnotationShapeData[]) => void;
}

interface Draft {
  anchor: NormalizedPoint;
  shape: AnnotationShapeData;
}

let idCounter = 0;
/** Stable ids: a counter plus a random part, so an id is never reused after a delete or a reload. */
function newShapeId(kind: string): string {
  idCounter += 1;
  return `${kind}-${idCounter.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function nudgePoint(
  point: TrajectoryPoint,
  dx: number,
  dy: number,
): TrajectoryPoint {
  return { ...point, x: clamp01(point.x + dx), y: clamp01(point.y + dy) };
}

function isDraftTooSmall(shape: AnnotationShapeData): boolean {
  if (shape.kind === 'rectangle' || shape.kind === 'ellipse') {
    return shape.width < MIN_DRAWN_SIZE || shape.height < MIN_DRAWN_SIZE;
  }
  if (shape.kind === 'text') {
    return false;
  }
  if (shape.points.length < 2) {
    return true;
  }
  const first = shape.points[0];
  const last = shape.points[shape.points.length - 1];
  return (
    shape.kind === 'arrow' &&
    Math.abs(first.x - last.x) < MIN_DRAWN_SIZE &&
    Math.abs(first.y - last.y) < MIN_DRAWN_SIZE
  );
}

export default function GeometryEditorDialog({
  durationSeconds = 5,
  imageAspect: fallbackAspect = DEFAULT_ASPECT,
  imageSrc,
  initialPoints = [],
  initialShapes = [],
  mode,
  onOpenChange,
  onSavePoints,
  onSaveShapes,
}: GeometryEditorDialogProps) {
  const translate = useTranslations('pages.workflows.geometryEditor');
  const { subjectName } = useGeometryMessages();
  const helpId = useId();
  const keysId = useId();

  const isTrajectory = mode === 'trajectory';
  const totalFrames = totalFramesFor(durationSeconds);
  const [measuredAspect, setMeasuredAspect] = useState<number | null>(null);
  const imageAspect = measuredAspect ?? fallbackAspect;
  const viewHeight = Math.round(VIEW_WIDTH / imageAspect);

  const [shapeState, dispatchShapes] = useReducer(
    geometryHistoryReducer<AnnotationShapeData>,
    initialShapes,
    createGeometryHistory,
  );
  const [pointState, dispatchPoints] = useReducer(
    geometryHistoryReducer<TrajectoryPoint>,
    initialPoints,
    createGeometryHistory,
  );
  const [tool, setTool] = useState<Tool>(isTrajectory ? 'point' : 'select');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cursor, setCursor] = useState<NormalizedPoint>({ x: 0.5, y: 0.5 });
  const [isStageFocused, setIsStageFocused] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const dragLast = useRef<NormalizedPoint | null>(null);
  const stageRef = useRef<SVGSVGElement | null>(null);

  const shapes = shapeState.items;
  const points = pointState.items;
  const selectedShapeId = shapeState.selectedId;
  const selectedPointIndex =
    pointState.selectedId === null
      ? -1
      : Number(pointState.selectedId.slice(1));
  const selectedShape = shapes.find((shape) => shape.id === selectedShapeId);

  const issues: GeometryIssue[] = useMemo(
    () =>
      isTrajectory
        ? validateTrajectory(points, totalFrames)
        : validateShapes(shapes),
    [isTrajectory, points, shapes, totalFrames],
  );
  const issueById = useMemo(
    () => new Map(issues.map((issue) => [issue.id, issue])),
    [issues],
  );
  const canUndo =
    (isTrajectory ? pointState.history : shapeState.history).length > 0;
  const itemCount = isTrajectory ? points.length : shapes.length;

  const commitPoints = useCallback(
    (next: NormalizedPoint[], selectIndex?: number | null) => {
      let selectedId: string | null | undefined;
      if (selectIndex === null) {
        selectedId = null;
      } else if (selectIndex !== undefined) {
        selectedId = pointIdAt(selectIndex);
      }
      dispatchPoints({
        items: withEvenFrames(next, totalFrames),
        selectedId,
        type: 'commit',
      });
    },
    [totalFrames],
  );

  const addShape = (shape: AnnotationShapeData) => {
    dispatchShapes({
      items: [...shapes, shape],
      selectedId: shape.id,
      type: 'commit',
    });
    setTool('select');
    setAnnouncement(
      translate('announce.shapeAdded', {
        name: subjectName(shapeSubject([...shapes, shape], shape)),
      }),
    );
  };

  const addPointAt = (at: NormalizedPoint) => {
    commitPoints([...points, at], points.length);
    setAnnouncement(
      translate('announce.pointAdded', { index: points.length + 1 }),
    );
  };

  const deleteShape = (shape: AnnotationShapeData) => {
    dispatchShapes({
      items: shapes.filter((candidate) => candidate.id !== shape.id),
      selectedId: null,
      type: 'commit',
    });
    setAnnouncement(
      translate('announce.shapeDeleted', {
        name: subjectName(shapeSubject(shapes, shape)),
      }),
    );
  };

  const deletePoint = (index: number) => {
    commitPoints(
      points.filter((_, position) => position !== index),
      null,
    );
    setAnnouncement(translate('announce.pointDeleted', { index: index + 1 }));
  };

  const pointerAt = (event: PointerEvent<SVGSVGElement>): NormalizedPoint => {
    const rect = stageRef.current?.getBoundingClientRect();
    return rect
      ? toNormalized(event.clientX, event.clientY, rect)
      : { x: 0, y: 0 };
  };

  const capturePointer = (pointerId: number) => {
    stageRef.current?.setPointerCapture?.(pointerId);
  };

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    stageRef.current?.focus();
    const at = pointerAt(event);
    setCursor(at);
    const itemId =
      (event.target as Element)
        .closest('[data-item]')
        ?.getAttribute('data-item') ?? null;

    if (isTrajectory) {
      if (itemId) {
        // Start moving an existing point; the whole drag is one history entry.
        dispatchPoints({ type: 'checkpoint' });
        dispatchPoints({ id: itemId, type: 'select' });
        dragLast.current = at;
        capturePointer(event.pointerId);
      } else if (tool === 'point') {
        addPointAt(at);
      } else {
        dispatchPoints({ id: null, type: 'select' });
      }
      return;
    }

    if (tool === 'select') {
      if (itemId) {
        dispatchShapes({ type: 'checkpoint' });
        dispatchShapes({ id: itemId, type: 'select' });
        dragLast.current = at;
        capturePointer(event.pointerId);
      } else {
        dispatchShapes({ id: null, type: 'select' });
      }
      return;
    }

    capturePointer(event.pointerId);
    const id = newShapeId(tool);
    if (tool === 'text') {
      addShape({ id, kind: 'text', text: '', x: at.x, y: at.y });
      return;
    }
    if (tool === 'rectangle' || tool === 'ellipse') {
      setDraft({
        anchor: at,
        shape: { height: 0, id, kind: tool, width: 0, x: at.x, y: at.y },
      });
    } else if (tool === 'arrow' || tool === 'freehand') {
      setDraft({ anchor: at, shape: { id, kind: tool, points: [at, at] } });
    }
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const at = pointerAt(event);
    if (draft) {
      const { anchor, shape } = draft;
      if (shape.kind === 'rectangle' || shape.kind === 'ellipse') {
        setDraft({
          anchor,
          shape: {
            ...shape,
            height: Math.abs(at.y - anchor.y),
            width: Math.abs(at.x - anchor.x),
            x: Math.min(at.x, anchor.x),
            y: Math.min(at.y, anchor.y),
          },
        });
      } else if (shape.kind === 'arrow') {
        setDraft({ anchor, shape: { ...shape, points: [anchor, at] } });
      } else if (shape.kind === 'freehand') {
        setDraft({
          anchor,
          shape: { ...shape, points: [...shape.points, at] },
        });
      }
      return;
    }
    const last = dragLast.current;
    if (!last) {
      return;
    }
    const dx = at.x - last.x;
    const dy = at.y - last.y;
    dragLast.current = at;
    if (isTrajectory) {
      if (selectedPointIndex >= 0) {
        dispatchPoints({
          items: points.map((point, index) =>
            index === selectedPointIndex ? nudgePoint(point, dx, dy) : point,
          ),
          type: 'live',
        });
      }
    } else if (selectedShape) {
      dispatchShapes({
        items: shapes.map((shape) =>
          shape.id === selectedShape.id ? moveShape(shape, dx, dy) : shape,
        ),
        type: 'live',
      });
    }
  };

  const handlePointerUp = () => {
    dragLast.current = null;
    if (!draft) {
      return;
    }
    const { shape } = draft;
    setDraft(null);
    if (!isDraftTooSmall(shape)) {
      addShape(shape);
    }
  };

  const nudgeSelection = (dx: number, dy: number): boolean => {
    if (isTrajectory && selectedPointIndex >= 0) {
      dispatchPoints({
        items: points.map((point, index) =>
          index === selectedPointIndex ? nudgePoint(point, dx, dy) : point,
        ),
        selectedId: pointState.selectedId,
        type: 'commit',
      });
      return true;
    }
    if (!isTrajectory && selectedShape) {
      dispatchShapes({
        items: shapes.map((shape) =>
          shape.id === selectedShape.id ? moveShape(shape, dx, dy) : shape,
        ),
        selectedId: selectedShape.id,
        type: 'commit',
      });
      return true;
    }
    return false;
  };

  const removeSelected = () => {
    if (isTrajectory && selectedPointIndex >= 0) {
      deletePoint(selectedPointIndex);
    } else if (!isTrajectory && selectedShape) {
      deleteShape(selectedShape);
    }
  };

  const placeAtCursor = () => {
    if (isTrajectory) {
      addPointAt(cursor);
      return;
    }
    if (tool === 'select' || tool === 'point') {
      return;
    }
    const id = newShapeId(tool);
    if (tool === 'rectangle' || tool === 'ellipse') {
      addShape({
        ...DEFAULT_SIZE,
        id,
        kind: tool,
        x: clamp01(cursor.x - DEFAULT_SIZE.width / 2),
        y: clamp01(cursor.y - DEFAULT_SIZE.height / 2),
      });
    } else if (tool === 'text') {
      addShape({ id, kind: 'text', text: '', x: cursor.x, y: cursor.y });
    } else {
      addShape({
        id,
        kind: tool,
        points: [
          { x: clamp01(cursor.x - 0.1), y: cursor.y },
          { x: clamp01(cursor.x + 0.1), y: cursor.y },
        ],
      });
    }
  };

  const undo = () => {
    if (isTrajectory) {
      dispatchPoints({ type: 'undo' });
    } else {
      dispatchShapes({ type: 'undo' });
    }
  };

  const clear = () => {
    if (isTrajectory) {
      dispatchPoints({ type: 'clear' });
    } else {
      dispatchShapes({ type: 'clear' });
    }
    setAnnouncement(translate('announce.cleared'));
  };

  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const step = event.shiftKey ? KEY_STEP_BIG : KEY_STEP;
    const arrows: Record<string, [number, number]> = {
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
    };
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
      return;
    }
    const move = arrows[event.key];
    if (move) {
      event.preventDefault();
      if (!nudgeSelection(move[0], move[1])) {
        setCursor((current) => ({
          x: clamp01(current.x + move[0]),
          y: clamp01(current.y + move[1]),
        }));
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      placeAtCursor();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeSelected();
    } else if (
      event.key === 'Escape' &&
      (selectedShapeId || selectedPointIndex >= 0)
    ) {
      event.stopPropagation();
      dispatchShapes({ id: null, type: 'select' });
      dispatchPoints({ id: null, type: 'select' });
    }
  };

  const save = () => {
    if (isTrajectory) {
      onSavePoints?.(points);
    } else {
      onSaveShapes?.(shapes);
    }
    onOpenChange(false);
  };

  const toolOptions = useGeometryToolOptions(isTrajectory);

  const visibleShapes = draft ? [...shapes, draft.shape] : shapes;
  const toolCursor = tool === 'select' ? 'move' : 'crosshair';

  return (
    <Dialog onOpenChange={onOpenChange} open>
      {/* The canvas behind the dialog listens on window for Delete, F, L and Ctrl+Z
          (useCanvasKeyboardShortcuts): keys pressed in this dialog stay in it, or Delete
          would remove the selected node. */}
      <DialogContent
        aria-describedby={helpId}
        className="gap-0 overflow-hidden p-0"
        onKeyDown={(event) => event.stopPropagation()}
        size="2xl"
      >
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>
            {translate(isTrajectory ? 'trajectoryTitle' : 'annotationTitle')}
          </DialogTitle>
          <DialogDescription id={helpId}>
            {isTrajectory
              ? translate('trajectoryDescription', {
                  frames: totalFrames,
                  seconds: durationSeconds,
                })
              : translate('annotationDescription')}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-col gap-4 p-5 md:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl<string>
                ariaLabel={translate('tool.label')}
                onValueChange={(value) => setTool(value as Tool)}
                options={toolOptions}
                value={tool}
              />
              <div className="ml-auto flex items-center gap-1">
                <Button
                  ariaLabel={translate('undo')}
                  disabled={!canUndo}
                  icon={<Undo2 className="size-4" />}
                  onClick={undo}
                  size={ButtonSize.SM}
                  textTransform="none"
                  tooltip={translate('undoTooltip')}
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                >
                  {translate('undo')}
                </Button>
                <Button
                  ariaLabel={translate('clearAll')}
                  disabled={itemCount === 0}
                  icon={<Trash2 className="size-4" />}
                  onClick={clear}
                  size={ButtonSize.SM}
                  textTransform="none"
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                >
                  {translate('clear')}
                </Button>
              </div>
            </div>

            <div
              className="relative w-full overflow-hidden rounded-md border border-border bg-muted"
              style={{ aspectRatio: String(imageAspect) }}
            >
              <Image
                alt=""
                className="select-none object-cover"
                draggable={false}
                fill
                unoptimized
                onLoad={(event) => {
                  const { naturalHeight, naturalWidth } = event.currentTarget;
                  if (naturalWidth > 0 && naturalHeight > 0) {
                    setMeasuredAspect(naturalWidth / naturalHeight);
                  }
                }}
                src={imageSrc}
              />
              <svg
                aria-describedby={keysId}
                aria-label={translate(
                  isTrajectory ? 'trajectoryCanvas' : 'annotationCanvas',
                )}
                className="absolute inset-0 size-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="geometry-stage"
                onBlur={() => setIsStageFocused(false)}
                onFocus={() => setIsStageFocused(true)}
                onKeyDown={handleKeyDown}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                preserveAspectRatio="none"
                ref={stageRef}
                role="application"
                // biome-ignore lint/a11y/noNoninteractiveTabindex: the drawing canvas is operated with the keyboard (arrows, Enter, Delete), so it must take focus
                tabIndex={0}
                viewBox={`0 0 ${VIEW_WIDTH} ${viewHeight}`}
              >
                {isTrajectory ? (
                  <TrajectoryLayer
                    issueById={issueById}
                    points={points}
                    selectedIndex={selectedPointIndex}
                    viewHeight={viewHeight}
                  />
                ) : (
                  <ShapeLayer
                    issueById={issueById}
                    selectedShapeId={selectedShapeId}
                    shapes={visibleShapes}
                    toolCursor={toolCursor}
                    viewHeight={viewHeight}
                  />
                )}
                {isStageFocused ? (
                  <g
                    pointerEvents="none"
                    stroke="hsl(var(--foreground))"
                    strokeWidth={1.5}
                  >
                    <line
                      vectorEffect="non-scaling-stroke"
                      x1={cursor.x * VIEW_WIDTH - 14}
                      x2={cursor.x * VIEW_WIDTH + 14}
                      y1={cursor.y * viewHeight}
                      y2={cursor.y * viewHeight}
                    />
                    <line
                      vectorEffect="non-scaling-stroke"
                      x1={cursor.x * VIEW_WIDTH}
                      x2={cursor.x * VIEW_WIDTH}
                      y1={cursor.y * viewHeight - 14}
                      y2={cursor.y * viewHeight + 14}
                    />
                  </g>
                ) : null}
              </svg>
            </div>

            <p aria-live="polite" className="sr-only" role="status">
              {announcement}
            </p>
            <p className="text-xs text-muted-foreground" id={keysId}>
              {translate(
                isTrajectory ? 'keyboardTrajectory' : 'keyboardAnnotation',
              )}
            </p>
          </div>

          <GeometryItemList
            isTrajectory={isTrajectory}
            issues={issues}
            onChangeText={(shapeId, text) =>
              dispatchShapes({
                items: shapes.map((shape) =>
                  shape.id === shapeId && shape.kind === 'text'
                    ? { ...shape, text }
                    : shape,
                ),
                type: 'live',
              })
            }
            onDeletePoint={deletePoint}
            onDeleteShape={deleteShape}
            onSelectPoint={(index) =>
              dispatchPoints({ id: pointIdAt(index), type: 'select' })
            }
            onSelectShape={(shapeId) =>
              dispatchShapes({ id: shapeId, type: 'select' })
            }
            points={points}
            selectedPointIndex={selectedPointIndex}
            selectedShapeId={selectedShapeId}
            shapes={shapes}
          />
        </DialogBody>

        <DialogFooter className="border-t border-border px-5 py-3">
          <Button
            onClick={() => onOpenChange(false)}
            textTransform="none"
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            {translate('cancel')}
          </Button>
          <Button onClick={save} textTransform="none" withWrapper={false}>
            {translate(isTrajectory ? 'saveTrajectory' : 'saveAnnotations')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

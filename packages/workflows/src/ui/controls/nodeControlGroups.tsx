'use client';

import type {
  AnnotationShapeData,
  CameraMovement,
  MotionControlNodeData,
  TrajectoryPoint,
} from '@genfeedai/contracts/types';
import { Pencil, Route } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  FRAMES_PER_SECOND,
  type GeometryIssue,
  modeUsesTrajectory,
  readShapes,
  readTrajectoryPoints,
  totalFramesFor,
  validateShapes,
  validateTrajectory,
} from '../../engine/utils/geometry';
import type { ControlGroup } from './types';
import { useGeometryMessages } from './useGeometryMessages';

/** The node has little room: it names the first problem and counts the rest. The inspector lists them all. */
export type ControlScope = 'inspector' | 'node';

const CAMERA_MOVEMENTS: CameraMovement[] = [
  'static',
  'pan_left',
  'pan_right',
  'pan_up',
  'pan_down',
  'zoom_in',
  'zoom_out',
  'rotate_cw',
  'rotate_ccw',
  'dolly_in',
  'dolly_out',
];

/** The inspector lists every problem; the node names the first and counts the rest. */
function summarizeIssues(
  messages: string[],
  isInspector: boolean,
  withCount: (first: string, count: number) => string,
): string | undefined {
  if (messages.length === 0) {
    return undefined;
  }
  if (isInspector) {
    return messages.join(' ');
  }
  return messages.length === 1
    ? messages[0]
    : withCount(messages[0], messages.length - 1);
}

function usesCamera(mode: unknown): boolean {
  return mode === 'camera' || mode === 'combined';
}

export function motionDuration(data: Partial<MotionControlNodeData>): 5 | 10 {
  return data.duration === 10 ? 10 : 5;
}

/**
 * Geometry problems on a motion node. An empty path only counts once a run has been tried: until
 * then it is just not drawn yet.
 */
export function motionIssues(
  data: Partial<MotionControlNodeData>,
  hasAttemptedRun: boolean,
): GeometryIssue[] {
  if (!modeUsesTrajectory(data.mode)) {
    return [];
  }
  const points = readTrajectoryPoints(data.trajectoryPoints);
  return validateTrajectory(
    points,
    totalFramesFor(motionDuration(data)),
  ).filter(
    (issue) =>
      issue.code !== 'pathTooShort' || hasAttemptedRun || points.length > 0,
  );
}

export function annotationIssues(annotations: unknown): GeometryIssue[] {
  return validateShapes(readShapes(annotations));
}

interface MotionGroupsArgs {
  data: Partial<MotionControlNodeData>;
  hasImage: boolean;
  hasAttemptedRun: boolean;
  onEditTrajectory: () => void;
  scope: ControlScope;
}

interface AnnotationGroupsArgs {
  annotations: AnnotationShapeData[];
  hasImage: boolean;
  onEdit: () => void;
  scope: ControlScope;
}

/** The same description feeds the node and the inspector. */
export function useMotionControlGroups({
  data,
  hasAttemptedRun,
  hasImage,
  onEditTrajectory,
  scope,
}: MotionGroupsArgs): { groups: ControlGroup[]; issues: GeometryIssue[] } {
  const translate = useTranslations('pages.workflows.nodeControls');
  const { describeIssue } = useGeometryMessages();
  const points: TrajectoryPoint[] = readTrajectoryPoints(data.trajectoryPoints);
  const duration = motionDuration(data);
  const issues = useMemo(
    () => motionIssues(data, hasAttemptedRun),
    [data, hasAttemptedRun],
  );
  const isInspector = scope === 'inspector';

  const pathError = summarizeIssues(
    issues.map(describeIssue),
    isInspector,
    (first, count) => translate('moreIssues', { count, first }),
  );

  const summary = translate('motion.trajectorySummary', {
    frames: duration * FRAMES_PER_SECOND,
    points: points.length,
    seconds: duration,
  });

  const motion: ControlGroup = {
    description: translate('motion.motionGroupDescription'),
    fields: [
      {
        help: isInspector ? translate('motion.modeHelp') : undefined,
        id: 'mode',
        kind: 'select',
        label: translate('motion.mode'),
        options: [
          {
            label: translate('motion.modeTrajectory'),
            value: 'trajectory',
          },
          { label: translate('motion.modeCamera'), value: 'camera' },
          { label: translate('motion.modeCombined'), value: 'combined' },
          {
            label: translate('motion.modeVideoTransfer'),
            value: 'video_transfer',
          },
        ],
      },
      {
        actions: [
          {
            disabledReason: hasImage ? undefined : translate('connectImage'),
            icon: <Route className="size-4" />,
            id: 'edit-trajectory',
            isPrimary: points.length === 0,
            label: translate(
              points.length === 0 ? 'motion.actionDraw' : 'motion.actionEdit',
            ),
            onSelect: onEditTrajectory,
          },
        ],
        error: pathError,
        help: isInspector ? translate('motion.trajectoryHelp') : undefined,
        id: 'trajectoryPoints',
        isVisible: (values) => modeUsesTrajectory(values.mode),
        kind: 'summary',
        label: translate('motion.trajectory'),
        summary,
      },
      {
        id: 'cameraMovement',
        isVisible: (values) => usesCamera(values.mode),
        kind: 'select',
        label: translate('motion.cameraMovement'),
        options: CAMERA_MOVEMENTS.map((value) => ({
          label: translate(`motion.camera.${value}`),
          value,
        })),
      },
      {
        help: translate('motion.cameraIntensityHelp'),
        id: 'cameraIntensity',
        isVisible: (values) => usesCamera(values.mode) && isInspector,
        kind: 'slider',
        label: translate('motion.cameraIntensity'),
        max: 100,
        min: 0,
        step: 5,
        unit: '%',
      },
    ],
    id: 'motion',
    label: translate('motion.motionGroupLabel'),
  };

  if (!isInspector) {
    return { groups: [motion], issues };
  }

  const output: ControlGroup = {
    fields: [
      {
        help: translate('motion.motionStrengthHelp'),
        id: 'motionStrength',
        kind: 'slider',
        label: translate('motion.motionStrength'),
        max: 100,
        min: 0,
        step: 5,
        unit: '%',
      },
      {
        id: 'duration',
        kind: 'select',
        label: translate('motion.duration'),
        options: [
          { label: translate('motion.durationFive'), value: '5' },
          { label: translate('motion.durationTen'), value: '10' },
        ],
      },
      {
        id: 'aspectRatio',
        kind: 'select',
        label: translate('motion.aspectRatio'),
        options: [
          { label: translate('motion.aspectRatioLandscape'), value: '16:9' },
          { label: translate('motion.aspectRatioPortrait'), value: '9:16' },
          { label: translate('motion.aspectRatioSquare'), value: '1:1' },
        ],
      },
    ],
    id: 'output',
    label: translate('motion.outputGroupLabel'),
  };

  const isTransfer = (values: Record<string, unknown>) =>
    values.mode === 'video_transfer';
  const transfer: ControlGroup = {
    description: translate('motion.transferGroupDescription'),
    fields: [
      {
        id: 'qualityMode',
        isVisible: isTransfer,
        kind: 'select',
        label: translate('motion.quality'),
        options: [
          { label: translate('motion.qualityStandard'), value: 'std' },
          { label: translate('motion.qualityPro'), value: 'pro' },
        ],
      },
      {
        id: 'characterOrientation',
        isVisible: isTransfer,
        kind: 'select',
        label: translate('motion.characterOrientation'),
        options: [
          {
            label: translate('motion.characterOrientationImage'),
            value: 'image',
          },
          {
            label: translate('motion.characterOrientationVideo'),
            value: 'video',
          },
        ],
      },
      {
        id: 'keepOriginalSound',
        isVisible: isTransfer,
        kind: 'switch',
        label: translate('motion.keepOriginalSound'),
      },
    ],
    id: 'transfer',
    label: translate('motion.transferGroupLabel'),
  };

  return { groups: [motion, output, transfer], issues };
}

export function useAnnotationControlGroups({
  annotations,
  hasImage,
  onEdit,
  scope,
}: AnnotationGroupsArgs): { groups: ControlGroup[]; issues: GeometryIssue[] } {
  const translate = useTranslations('pages.workflows.nodeControls');
  const geometryTranslate = useTranslations('pages.workflows.geometryEditor');
  const { describeIssue } = useGeometryMessages();
  const issues = useMemo(() => annotationIssues(annotations), [annotations]);
  const isInspector = scope === 'inspector';

  const error = summarizeIssues(
    issues.map(describeIssue),
    isInspector,
    (first, count) => translate('moreIssues', { count, first }),
  );

  const group: ControlGroup = {
    description: isInspector
      ? translate('annotation.groupDescription')
      : undefined,
    fields: [
      {
        actions: [
          {
            disabledReason: hasImage ? undefined : translate('connectImage'),
            icon: <Pencil className="size-4" />,
            id: 'edit-annotations',
            isPrimary: annotations.length === 0,
            label: translate(
              annotations.length === 0
                ? 'annotation.actionAdd'
                : 'annotation.actionEdit',
            ),
            onSelect: onEdit,
          },
        ],
        error,
        help: isInspector ? translate('annotation.fieldHelp') : undefined,
        id: 'annotations',
        kind: 'summary',
        label: translate('annotation.field'),
        summary: geometryTranslate('annotationCount', {
          count: annotations.length,
        }),
      },
    ],
    id: 'annotations',
    label: translate('annotation.groupLabel'),
  };

  return { groups: [group], issues };
}

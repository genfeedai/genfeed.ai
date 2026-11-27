'use client';

import type { SegmentedControlOption } from '@genfeedai/ui/primitives/segmented-control';
import {
  Circle,
  MapPin,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Square,
  Type,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

/** The tools for the open editor: select and move, plus a point for a path or shapes for annotations. */
export function useGeometryToolOptions(
  isTrajectory: boolean,
): SegmentedControlOption<string>[] {
  const translate = useTranslations('pages.workflows.geometryEditor');
  return isTrajectory
    ? [
        {
          ariaLabel: translate('tool.select'),
          icon: <MousePointer2 className="size-4" />,
          tooltip: translate('tool.select'),
          value: 'select',
        },
        {
          ariaLabel: translate('tool.point'),
          icon: <MapPin className="size-4" />,
          tooltip: translate('tool.point'),
          value: 'point',
        },
      ]
    : [
        {
          ariaLabel: translate('tool.select'),
          icon: <MousePointer2 className="size-4" />,
          tooltip: translate('tool.select'),
          value: 'select',
        },
        {
          ariaLabel: translate('tool.rectangle'),
          icon: <Square className="size-4" />,
          tooltip: translate('tool.rectangle'),
          value: 'rectangle',
        },
        {
          ariaLabel: translate('tool.ellipse'),
          icon: <Circle className="size-4" />,
          tooltip: translate('tool.ellipse'),
          value: 'ellipse',
        },
        {
          ariaLabel: translate('tool.arrow'),
          icon: <MoveUpRight className="size-4" />,
          tooltip: translate('tool.arrow'),
          value: 'arrow',
        },
        {
          ariaLabel: translate('tool.freehand'),
          icon: <Pencil className="size-4" />,
          tooltip: translate('tool.freehand'),
          value: 'freehand',
        },
        {
          ariaLabel: translate('tool.text'),
          icon: <Type className="size-4" />,
          tooltip: translate('tool.text'),
          value: 'text',
        },
      ];
}

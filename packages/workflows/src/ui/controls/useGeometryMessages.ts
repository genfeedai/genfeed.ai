'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import type { GeometryIssue, GeometrySubject } from '../lib/geometry';

export interface GeometryMessages {
  /** The translated sentence for one issue: "Rectangle 2 has no area. Drag it larger or delete it." */
  describeIssue: (issue: GeometryIssue) => string;
  /** "Rectangle 2", "Point 3" */
  subjectName: (subject: GeometrySubject) => string;
}

/** Maps the geometry module's issue codes to translated copy, so the module itself stays free of strings. */
export function useGeometryMessages(): GeometryMessages {
  const translate = useTranslations('pages.workflows.geometryEditor');

  const subjectName = useCallback(
    (subject: GeometrySubject): string => {
      if (subject.kind === 'path') {
        return translate('pathHeading');
      }
      return `${translate(`kind.${subject.kind}`)} ${subject.index}`;
    },
    [translate],
  );

  const describeIssue = useCallback(
    (issue: GeometryIssue): string =>
      translate(`issues.${issue.code}`, {
        frame: issue.frame ?? 0,
        subject: subjectName(issue.subject),
      }),
    [subjectName, translate],
  );

  return { describeIssue, subjectName };
}

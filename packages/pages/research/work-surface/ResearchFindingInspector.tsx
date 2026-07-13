'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import { HiOutlineXMark } from 'react-icons/hi2';
import { useOptionalResearchWorkSurface } from './ResearchWorkSurfaceProvider';

export default function ResearchFindingInspector(): ReactElement {
  const surface = useOptionalResearchWorkSurface();
  const finding = surface?.authorizedFinding ?? null;
  const isRestoring = Boolean(
    surface?.urlState.requestedReference && !surface.authorizedFinding,
  );

  return (
    <div className="space-y-3" data-testid="research-finding-inspector">
      {finding ? (
        <Card bodyClassName="gap-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {finding.reference.kind.replaceAll('-', ' ')}
              </p>
              <h2 className="mt-2 text-sm font-semibold leading-5 text-foreground">
                {finding.title}
              </h2>
            </div>
            <Button
              ariaLabel="Remove selected research finding"
              className="shrink-0"
              icon={<HiOutlineXMark className="size-4" />}
              onClick={() => surface?.clearFinding()}
              size={ButtonSize.ICON}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          </div>
          {finding.description ? (
            <p className="mt-2 line-clamp-6 text-xs leading-5 text-foreground/70">
              {finding.description}
            </p>
          ) : null}
          <dl className="mt-4 space-y-2 border-t border-border pt-3">
            {finding.metadata.map((item) => (
              <div
                className="flex items-start justify-between gap-3 text-xs"
                key={`${item.label}:${item.value}`}
              >
                <dt className="text-muted-foreground">{item.label}</dt>
                <dd className="text-right text-foreground/80">{item.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : isRestoring ? (
        <div
          aria-live="polite"
          className="gen-shell-empty-state p-4"
          role="status"
        >
          <p className="text-sm font-medium text-foreground">
            Restoring selected finding…
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            The reference becomes available only after the scoped Research query
            confirms access.
          </p>
        </div>
      ) : (
        <div className="gen-shell-empty-state p-4">
          <p className="text-sm font-medium text-foreground">
            Select a research finding
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            The inspector and composer receive only its typed canonical
            reference. Display text never grants execution authority.
          </p>
        </div>
      )}
    </div>
  );
}

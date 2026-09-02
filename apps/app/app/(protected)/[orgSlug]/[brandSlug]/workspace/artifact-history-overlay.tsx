'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  ArtifactHistoryOverlayProps,
  ArtifactVersionPin,
} from '@props/modals/artifact-history-overlay.props';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@ui/primitives/dialog';
import { ArrowUpRight, Check, Lock } from 'lucide-react';

function isCurrentPin(version: ArtifactVersionPin, currentId: string): boolean {
  return version.isCurrent || version.id === currentId;
}

export default function ArtifactHistoryOverlay({
  currentVersionId,
  isApproving,
  isOpen,
  onApprove,
  onOpenChange,
  onOpenVersion,
  versions,
}: ArtifactHistoryOverlayProps) {
  const currentVersion = versions.find((version) =>
    isCurrentPin(version, currentVersionId),
  );
  const approveTargetLabel = currentVersion?.label ?? 'the current version';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogPortal>
        {/* Light scrim — the active conversation stays mounted and visible behind it. */}
        <DialogOverlay
          className={
            'bg-black/40 backdrop-blur-[1px]' // design-system-allow-content-color
          }
        />
        <DialogContent className="max-w-[600px] gap-4 border-border-strong bg-popover">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              Artifact history
            </DialogTitle>
            <DialogDescription>
              Temporary overlay · active conversation remains mounted
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2.5">
            {versions.map((version) => {
              if (isCurrentPin(version, currentVersionId)) {
                return (
                  <div
                    key={version.id}
                    className="flex items-center gap-3.5 rounded-lg bg-accent p-3.5 ring-1 ring-inset ring-info"
                  >
                    <span className="text-base font-semibold text-info">
                      {version.label}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-medium text-foreground">
                        {version.title}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {version.subtitle}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-2xs font-medium uppercase tracking-wider text-info">
                      <Lock className="size-3" aria-hidden />
                      {version.isImmutable ? 'Current · immutable' : 'Current'}
                    </span>
                  </div>
                );
              }

              return (
                <Button
                  key={version.id}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  onClick={() => onOpenVersion(version.id)}
                  className="flex w-full items-center gap-3.5 rounded-md bg-background-secondary p-3.5 text-left shadow-border transition-colors hover:bg-accent/50 hover:shadow-border-strong"
                >
                  <span className="text-base font-semibold text-foreground">
                    {version.label}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">
                      {version.title}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {version.subtitle}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                    Open
                    <ArrowUpRight className="size-3" aria-hidden />
                  </span>
                </Button>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            Approval binds to {approveTargetLabel}. Any revision creates a new
            version.
          </p>

          <DialogFooter>
            <Button
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            <Button
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              disabled={isApproving || !currentVersion}
              onClick={() => onApprove(currentVersionId)}
            >
              <Check className="size-4" />
              {isApproving ? 'Approving…' : `Approve ${approveTargetLabel}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

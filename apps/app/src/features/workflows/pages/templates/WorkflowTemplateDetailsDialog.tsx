'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import type { Edge, Node } from '@xyflow/react';
import Link from 'next/link';
import WorkflowCardPreview from '../library/WorkflowCardPreview';

export type WorkflowTemplateDetailsDialogProps = {
  actionLabel: string;
  categoryLabel: string;
  changeSummary?: string;
  description: string;
  href?: string;
  isInstalling?: boolean;
  isOpen: boolean;
  onInstall?: () => void;
  onOpenChange: (isOpen: boolean) => void;
  preview?: {
    edges?: Edge[];
    name: string;
    nodes?: Node[];
    thumbnail?: string | null;
  };
  scheduleLabel?: string | null;
  sourceLabel: string;
  title: string;
};

export function WorkflowTemplateDetailsDialog({
  actionLabel,
  categoryLabel,
  changeSummary,
  description,
  href,
  isInstalling = false,
  isOpen,
  onInstall,
  onOpenChange,
  preview,
  scheduleLabel,
  sourceLabel,
  title,
}: WorkflowTemplateDetailsDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Source</dt>
          <dd>{sourceLabel}</dd>
          <dt className="text-muted-foreground">Category</dt>
          <dd>{categoryLabel}</dd>
          {scheduleLabel ? (
            <>
              <dt className="text-muted-foreground">Schedule</dt>
              <dd>{scheduleLabel}</dd>
            </>
          ) : null}
        </dl>
        {changeSummary ? (
          <p className="text-sm text-foreground/80">{changeSummary}</p>
        ) : null}
        {preview ? (
          <WorkflowCardPreview
            name={preview.name}
            thumbnail={preview.thumbnail}
            nodes={preview.nodes}
            edges={preview.edges}
          />
        ) : null}
        <DialogFooter>
          {onInstall ? (
            <Button
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              disabled={isInstalling}
              onClick={onInstall}
            >
              {isInstalling ? 'Installing…' : actionLabel}
            </Button>
          ) : href ? (
            <Button
              asChild
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              withWrapper={false}
            >
              <Link href={href}>{actionLabel}</Link>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

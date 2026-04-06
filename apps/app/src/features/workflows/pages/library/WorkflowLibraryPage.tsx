'use client';

import { ButtonVariant } from '@genfeedai/enums';
import {
  createWorkflowApiService,
  getLifecycleBadgeClass,
  type WorkflowSummary,
} from '@genfeedai/workflow';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineBolt,
  HiOutlineDocumentDuplicate,
  HiOutlinePlus,
  HiOutlineSparkles,
} from 'react-icons/hi2';

const DEFAULT_WORKFLOW_CARD_CDN =
  process.env.NEXT_PUBLIC_CDN_URL || 'https://cdn.genfeed.ai';
const DEFAULT_WORKFLOW_CARD_IMAGE = `${DEFAULT_WORKFLOW_CARD_CDN}${metadata.cards.default}`;

function isVideoUrl(url: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
  const lowerUrl = url.toLowerCase();
  return videoExtensions.some((ext) => lowerUrl.includes(ext));
}

function WorkflowCardPreview({
  name,
  thumbnail,
}: {
  name: string;
  thumbnail?: string | null;
}) {
  const [hasAssetError, setHasAssetError] = useState(false);
  const previewUrl = useMemo(() => {
    if (!thumbnail || hasAssetError) {
      return DEFAULT_WORKFLOW_CARD_IMAGE;
    }

    return thumbnail;
  }, [hasAssetError, thumbnail]);

  const isVideoPreview =
    previewUrl !== DEFAULT_WORKFLOW_CARD_IMAGE && isVideoUrl(previewUrl);

  return (
    <div className="relative aspect-video overflow-hidden rounded border border-white/5 bg-background/40">
      {isVideoPreview ? (
        <video
          src={previewUrl}
          className="h-full w-full object-cover object-center"
          autoPlay
          muted
          loop
          playsInline
          onError={() => setHasAssetError(true)}
        />
      ) : (
        // biome-ignore lint/performance/noImgElement: dynamic CDN thumbnails not optimizable by next/image
        <img
          src={previewUrl}
          alt={
            previewUrl === DEFAULT_WORKFLOW_CARD_IMAGE
              ? 'Default workflow card'
              : `${name} thumbnail`
          }
          className="h-full w-full object-cover object-center"
          onError={() => setHasAssetError(true)}
        />
      )}
    </div>
  );
}

function EmptyWorkflowState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-white/10 bg-card/40 px-6 py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-foreground/5 text-foreground/30">
        <HiOutlineSparkles className="size-8" />
      </span>
      <div>
        <p className="text-lg font-medium">No workflows yet</p>
        <p className="mt-1 text-sm text-foreground/50">
          Create your first workflow for a fixed, repeatable automation
          pipeline.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/workflows/templates">
          <Button
            label="Browse Templates"
            variant={ButtonVariant.SECONDARY}
            icon={<HiOutlineDocumentDuplicate className="size-4" />}
          />
        </Link>
        <Link href="/workflows/new">
          <Button
            label="Create Workflow"
            variant={ButtonVariant.DEFAULT}
            icon={<HiOutlinePlus className="size-4" />}
          />
        </Link>
      </div>
    </div>
  );
}

/**
 * Workflow Library - List of saved workflows
 */
export default function WorkflowLibraryPage() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getService = useAuthedService(createWorkflowApiService);

  const loadWorkflows = useCallback(
    async (signal: AbortSignal) => {
      setIsLoading(true);
      setError(null);

      try {
        const service = await getService();
        if (signal.aborted) {
          return;
        }

        const data = await service.list();
        if (signal.aborted) {
          return;
        }

        setWorkflows(data);
      } catch (err) {
        if (signal.aborted) {
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Failed to load workflows';
        logger.error('Failed to load workflows', { error: err });
        setError(message);
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [getService],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadWorkflows(controller.signal);
    return () => controller.abort();
  }, [loadWorkflows]);

  if (isLoading) {
    return (
      <Container
        label="Workflows"
        description="Use workflows for fixed, reusable automation graphs and scheduled pipelines."
        icon={HiOutlineBolt}
        right={
          <>
            <div className="h-10 w-28 animate-pulse rounded bg-muted" />
            <div className="h-10 w-36 animate-pulse rounded bg-muted" />
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6'].map(
            (skeletonId) => (
              <div
                key={skeletonId}
                className="h-48 animate-pulse rounded-lg border border-white/[0.06] bg-card"
              />
            ),
          )}
        </div>
      </Container>
    );
  }

  if (error) {
    return (
      <Container
        label="Workflows"
        description="Use workflows for fixed, reusable automation graphs and scheduled pipelines."
        icon={HiOutlineBolt}
      >
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-destructive/30 bg-destructive/5 px-6 text-center">
          <p className="text-destructive">{error}</p>
          <Button
            label="Retry"
            variant={ButtonVariant.OUTLINE}
            onClick={() => {
              const controller = new AbortController();
              loadWorkflows(controller.signal);
            }}
          />
        </div>
      </Container>
    );
  }

  return (
    <Container
      label="Workflows"
      description="Use workflows for fixed, reusable automation graphs and scheduled pipelines."
      icon={HiOutlineBolt}
      right={
        <>
          <Link href="/workflows/templates">
            <Button
              label="Templates"
              variant={ButtonVariant.SECONDARY}
              icon={<HiOutlineDocumentDuplicate className="size-4" />}
            />
          </Link>
          <Link href="/workflows/new">
            <Button
              label="New Workflow"
              variant={ButtonVariant.DEFAULT}
              icon={<HiOutlinePlus className="size-4" />}
            />
          </Link>
        </>
      }
    >
      <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-foreground/70">
        <span className="font-medium text-foreground">Workflows</span> are
        explicit automation graphs. Schedule a workflow when the steps should be
        predictable and repeatable. For adaptive agent behavior, use
        <Link
          href="/orchestration/autopilot"
          className="ml-1 underline underline-offset-2"
        >
          Autopilot
        </Link>
        .
      </div>
      {workflows.length === 0 ? (
        <EmptyWorkflowState />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workflows.map((workflow) => (
            <Link key={workflow._id} href={`/workflows/${workflow._id}`}>
              <Card
                className="h-full hover:-translate-y-0.5"
                label={workflow.name}
                description={
                  workflow.description ??
                  'Reusable automation workflow for content operations.'
                }
                headerAction={
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${getLifecycleBadgeClass(
                      workflow.lifecycle,
                    )}`}
                  >
                    {workflow.lifecycle}
                  </span>
                }
                bodyClassName="h-full justify-between"
              >
                <div className="space-y-3">
                  <WorkflowCardPreview
                    name={workflow.name}
                    thumbnail={workflow.thumbnail}
                  />
                  <div className="rounded border border-white/5 bg-background/40 px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-foreground/40">
                      Created
                    </p>
                    <p className="mt-1 text-sm text-foreground/70">
                      {new Date(workflow.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-foreground/50">
                    <span>Open workflow</span>
                    <span className="underline underline-offset-2">
                      View details
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}

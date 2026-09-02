'use client';

import { ButtonSize, ButtonVariant, CardVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IEditorProject } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { EditorProjectsService } from '@services/editor/editor-projects.service';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Film, Music, Plus, Scissors, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';

const features = [
  {
    description:
      'Professional timeline-based video editing with multi-track support',
    icon: Film,
    title: 'Timeline Editor',
  },
  {
    description: 'Cut, trim, and splice clips with frame-accurate precision',
    icon: Scissors,
    title: 'Precise Trimming',
  },
  {
    description:
      'Synchronize audio tracks, add music, and adjust volume levels',
    icon: Music,
    title: 'Audio Sync',
  },
  {
    description: 'Apply effects, transitions, and color grading to your videos',
    icon: Sparkles,
    title: 'Effects & Transitions',
  },
] as const;

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) {
    return 'Just now';
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

export default function EditorProjectsPage() {
  const { href } = useOrgUrl();
  const notificationsService = NotificationsService.getInstance();
  const [projects, setProjects] = useState<IEditorProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isLoading = projects === null && error === null;
  const hasProjects = projects !== null && projects.length > 0;

  const getEditorService = useAuthedService((token: string) =>
    EditorProjectsService.getInstance(token),
  );

  const loadProjects = useCallback(async () => {
    try {
      setProjects(null);
      setError(null);
      const service = await getEditorService();
      const allProjects = await service.findAll();
      setProjects(allProjects);
    } catch (error) {
      logger.error('Failed to load editor projects', error);
      setError('Failed to load projects');
    }
  }, [getEditorService]);

  useEffect(() => {
    captureAnalyticsEvent(ANALYTICS_EVENTS.STUDIO_EDITOR_OPENED, {
      surface: 'index',
    });
    loadProjects();
  }, [loadProjects]);

  const handleDelete = useCallback(
    async (e: React.MouseEvent, projectId: string) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const service = await getEditorService();
        await service.delete(projectId);
        setProjects((prev) => (prev ?? []).filter((p) => p.id !== projectId));
      } catch (error) {
        logger.error('Failed to delete editor project', {
          error,
          projectId,
        });
        notificationsService.error('Failed to delete project');
      }
    },
    [getEditorService, notificationsService],
  );

  const newProjectButton = (
    <Button asChild size={ButtonSize.SM} variant={ButtonVariant.DEFAULT}>
      <Link href={href(APP_ROUTES.STUDIO.EDIT_NEW)}>
        <Plus className="size-4" />
        New Project
      </Link>
    </Button>
  );

  return (
    <Container className="py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">
          {hasProjects
            ? `Your Projects (${projects.length})`
            : isLoading
              ? 'Your Projects'
              : 'Video Editor'}
        </h1>
        {!isLoading && !error ? newProjectButton : null}
      </div>

      {isLoading ? (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            'editor-project-skeleton-1',
            'editor-project-skeleton-2',
            'editor-project-skeleton-3',
          ].map((skeletonId) => (
            <Card
              key={skeletonId}
              variant={CardVariant.DEFAULT}
              bodyClassName="gap-3 p-3"
            >
              <div className="animate-pulse space-y-3">
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
                <div className="h-24 rounded bg-muted" />
              </div>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card
          variant={CardVariant.DEFAULT}
          className="mb-6"
          bodyClassName="items-center gap-3 p-6 text-center"
        >
          <p className="text-sm text-foreground/60">{error}</p>
          <Button
            withWrapper={false}
            size={ButtonSize.SM}
            variant={ButtonVariant.LINK}
            onClick={loadProjects}
            className="text-sm"
          >
            Try again
          </Button>
        </Card>
      ) : hasProjects ? (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={href(`${APP_ROUTES.STUDIO.EDIT}/${project.id}`)}
              className="block"
            >
              <Card
                variant={CardVariant.DEFAULT}
                className="group h-full transition-colors hover:bg-foreground/[0.03]"
                bodyClassName="gap-3 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold">
                      {project.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-foreground/50">
                      {formatRelativeTime(project.updatedAt)}
                    </p>
                  </div>
                  <Button
                    withWrapper={false}
                    size={ButtonSize.XS}
                    variant={ButtonVariant.DESTRUCTIVE}
                    onClick={(e) => handleDelete(e, project.id)}
                    className="rounded p-1 text-foreground/40 opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
                    ariaLabel="Delete project"
                    tooltip="Delete project"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                <div className="flex aspect-video items-center justify-center rounded bg-muted/50">
                  <Film className="size-8 text-foreground/20" />
                </div>

                <div className="flex items-center gap-3 text-xs text-foreground/50">
                  <span>{project.tracks?.length || 0} tracks</span>
                  <span>&middot;</span>
                  <span>{project.settings?.format || 'landscape'}</span>
                  <span>&middot;</span>
                  <span>{project.status}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card
          variant={CardVariant.DEFAULT}
          className="mb-6"
          bodyClassName="items-center gap-3 p-6 text-center"
        >
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-primary/10">
            <Film className="size-5 text-primary" />
          </div>

          <div className="mx-auto max-w-xl">
            <h2 className="text-base font-semibold">
              Create Your First Project
            </h2>
            <p className="mt-1 text-sm text-foreground/60">
              Start a new video editing project to arrange clips on a timeline,
              add audio tracks, and apply effects. Your generated videos from
              the Studio can be imported directly.
            </p>
          </div>

          <Button asChild size={ButtonSize.SM} variant={ButtonVariant.DEFAULT}>
            <Link href={href(APP_ROUTES.STUDIO.EDIT_NEW)}>
              <Plus className="size-4" />
              Start New Project
            </Link>
          </Button>
        </Card>
      )}

      <h3 className="mb-2 text-xs font-semibold text-foreground">Features</h3>
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        {features.map((feature) => (
          <Card
            key={feature.title}
            variant={CardVariant.DEFAULT}
            icon={feature.icon}
            label={feature.title}
            description={feature.description}
            bodyClassName="p-3"
          />
        ))}
      </div>
    </Container>
  );
}

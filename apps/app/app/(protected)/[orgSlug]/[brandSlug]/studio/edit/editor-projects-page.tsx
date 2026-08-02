'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant, CardVariant } from '@genfeedai/enums';
import type { IEditorProject } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
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
    color: 'bg-muted text-muted-foreground',
    description:
      'Professional timeline-based video editing with multi-track support',
    icon: Film,
    title: 'Timeline Editor',
  },
  {
    color: 'bg-muted text-muted-foreground',
    description: 'Cut, trim, and splice clips with frame-accurate precision',
    icon: Scissors,
    title: 'Precise Trimming',
  },
  {
    color: 'bg-muted text-muted-foreground',
    description:
      'Synchronize audio tracks, add music, and adjust volume levels',
    icon: Music,
    title: 'Audio Sync',
  },
  {
    color: 'bg-muted text-muted-foreground',
    description: 'Apply effects, transitions, and color grading to your videos',
    icon: Sparkles,
    title: 'Effects & Transitions',
  },
];

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
  const [projects, setProjects] = useState<IEditorProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isLoading = projects === null && error === null;

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
    } catch (_err) {
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
      } catch {
        // Silently fail
      }
    },
    [getEditorService],
  );

  return (
    <Container className="py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="sr-only">Video Editor</h1>

        <Button
          asChild
          className="ml-auto inline-flex items-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          variant={ButtonVariant.DEFAULT}
          withWrapper={false}
        >
          <Link href={href(APP_ROUTES.STUDIO.EDIT_NEW)}>
            <Plus className="size-4" />
            New Project
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            'editor-project-skeleton-1',
            'editor-project-skeleton-2',
            'editor-project-skeleton-3',
          ].map((skeletonId) => (
            <Card
              key={skeletonId}
              variant={CardVariant.DEFAULT}
              className="p-6"
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
        <Card variant={CardVariant.DEFAULT} className="mb-8 p-8 text-center">
          <p className="mb-4 text-foreground/60">{error}</p>
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
      ) : projects !== null && projects.length > 0 ? (
        <>
          <h3 className="mb-4 text-lg font-semibold">
            Your Projects ({projects.length})
          </h3>
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={href(`${APP_ROUTES.STUDIO.EDIT}/${project.id}`)}
              >
                <Card
                  variant={CardVariant.DEFAULT}
                  className="group cursor-pointer p-3 transition-shadow hover:ring-1 hover:ring-primary/30"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate font-semibold">{project.name}</h4>
                      <p className="mt-1 text-xs text-foreground/50">
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

                  <div className="mb-3 flex aspect-video items-center justify-center rounded bg-muted/50">
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
        </>
      ) : (
        <Card variant={CardVariant.DEFAULT} className="mb-6 p-4">
          <div className="mx-auto max-w-xl text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-primary/10">
              <Film className="size-5 text-primary" />
            </div>

            <h2 className="mb-1 text-base font-semibold">
              Create Your First Project
            </h2>

            <p className="mb-4 text-sm text-foreground/60">
              Start a new video editing project to arrange clips on a timeline,
              add audio tracks, and apply effects. Your generated videos from
              the Studio can be imported directly.
            </p>

            <Button
              asChild
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
            >
              <Link href={href(APP_ROUTES.STUDIO.EDIT_NEW)}>
                <Plus className="size-4" />
                Start New Project
              </Link>
            </Button>
          </div>
        </Card>
      )}

      <h3 className="mb-3 text-base font-semibold">Features</h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {features.map((feature) => (
          <Card
            key={feature.title}
            variant={CardVariant.DEFAULT}
            className="p-3"
          >
            <div className="flex items-start gap-3">
              <div className={`rounded-md p-2 ${feature.color}`}>
                <feature.icon className="size-4" />
              </div>
              <div className="min-w-0">
                <h4 className="mb-0.5 text-sm font-medium">{feature.title}</h4>
                <p className="text-xs text-foreground/60">
                  {feature.description}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Container>
  );
}

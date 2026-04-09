'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant, CardVariant } from '@genfeedai/enums';
import type { IEditorProject } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { EditorProjectsService } from '@services/editor/editor-projects.service';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { track } from '@vercel/analytics';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  HiOutlineArrowLeft,
  HiOutlineFilm,
  HiOutlineMusicalNote,
  HiOutlinePlus,
  HiOutlineScissors,
  HiOutlineSparkles,
  HiOutlineTrash,
} from 'react-icons/hi2';

const features = [
  {
    color: 'bg-blue-500/20 text-blue-400',
    description:
      'Professional timeline-based video editing with multi-track support',
    icon: HiOutlineFilm,
    title: 'Timeline Editor',
  },
  {
    color: 'bg-green-500/20 text-green-400',
    description: 'Cut, trim, and splice clips with frame-accurate precision',
    icon: HiOutlineScissors,
    title: 'Precise Trimming',
  },
  {
    color: 'bg-purple-500/20 text-purple-400',
    description:
      'Synchronize audio tracks, add music, and adjust volume levels',
    icon: HiOutlineMusicalNote,
    title: 'Audio Sync',
  },
  {
    color: 'bg-orange-500/20 text-orange-400',
    description: 'Apply effects, transitions, and color grading to your videos',
    icon: HiOutlineSparkles,
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
  const _brandId = useBrandId();
  const [projects, setProjects] = useState<IEditorProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getEditorService = useAuthedService((token: string) =>
    EditorProjectsService.getInstance(token),
  );

  const loadProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const service = await getEditorService();
      const allProjects = await service.findAll();
      setProjects(allProjects);
    } catch (_err) {
      setError('Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  }, [getEditorService]);

  useEffect(() => {
    track('studio_editor_opened', { surface: 'index' });
    loadProjects();
  }, [loadProjects]);

  const handleDelete = useCallback(
    async (e: React.MouseEvent, projectId: string) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const service = await getEditorService();
        await service.delete(projectId);
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
      } catch {
        // Silently fail
      }
    },
    [getEditorService],
  );

  return (
    <Container className="py-10">
      <div className="mb-8 flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Link
              href="/studio/video"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-foreground/40 transition-colors duration-150 hover:bg-white/[0.06] hover:text-foreground"
              aria-label="Back to Studio"
            >
              <HiOutlineArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-3xl font-bold">Video Editor</h1>
          </div>
          <p className="text-foreground/60">
            Advanced video editing with timeline, transitions, and professional
            tools.
          </p>
        </div>

        <Link
          href="/editor/new"
          className="inline-flex items-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <HiOutlinePlus className="h-4 w-4" />
          New Project
        </Link>
      </div>

      {isLoading ? (
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} variant={CardVariant.DEFAULT} className="p-6">
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
      ) : projects.length > 0 ? (
        <>
          <h3 className="mb-4 text-lg font-semibold">
            Your Projects ({projects.length})
          </h3>
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link key={project.id} href={`/editor/${project.id}`}>
                <Card
                  variant={CardVariant.DEFAULT}
                  className="group cursor-pointer p-6 transition-all hover:ring-1 hover:ring-primary/30"
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
                      variant={ButtonVariant.UNSTYLED}
                      onClick={(e) => handleDelete(e, project.id)}
                      className="rounded p-1 text-foreground/40 opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
                      ariaLabel="Delete project"
                      tooltip="Delete project"
                    >
                      <HiOutlineTrash className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mb-3 flex aspect-video items-center justify-center rounded bg-muted/50">
                    <HiOutlineFilm className="h-8 w-8 text-foreground/20" />
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
        <Card variant={CardVariant.DEFAULT} className="mb-8 p-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <HiOutlineFilm className="h-8 w-8 text-primary" />
            </div>

            <h2 className="mb-2 text-xl font-semibold">
              Create Your First Project
            </h2>

            <p className="mb-6 text-foreground/60">
              Start a new video editing project to arrange clips on a timeline,
              add audio tracks, and apply effects. Your generated videos from
              the Studio can be imported directly.
            </p>

            <Link
              href="/editor/new"
              className="inline-flex items-center gap-2 bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <HiOutlinePlus className="h-5 w-5" />
              Start New Project
            </Link>
          </div>
        </Card>
      )}

      <h3 className="mb-4 text-lg font-semibold">Features</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {features.map((feature) => (
          <Card
            key={feature.title}
            variant={CardVariant.DEFAULT}
            className="p-6"
          >
            <div className="flex items-start gap-4">
              <div className={`p-3 ${feature.color}`}>
                <feature.icon className="h-6 w-6" />
              </div>
              <div>
                <h4 className="mb-1 font-semibold">{feature.title}</h4>
                <p className="text-sm text-foreground/60">
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

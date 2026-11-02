'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { SegmentedControl } from '@ui/primitives/segmented-control';
import { Textarea } from '@ui/primitives/textarea';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import OrganizationModulePreferenceGate from '@/components/guards/organization-module/OrganizationModulePreferenceGate';
import { useMotionComposer } from '@/features/motion/hooks/use-motion-composer';
import type { MotionProjectViewProps } from '@/features/motion/props/motion-workspace.props';
import MotionComposer from './MotionComposer';
import MotionNotice from './MotionNotice';

/**
 * One open Motion project, on the right beside the agent: its revision
 * history, rendered outputs and retained source, with the prompt bar to
 * revise it, quote an export or retry a failed revision.
 */
export default function MotionProjectView({
  projectId,
}: MotionProjectViewProps): ReactElement {
  const { orgId, userId, sessionId } = useAuthIdentity();
  const { selectedBrand } = useBrand();
  // A different actor, brand or project starts from a clean form and no quote.
  return (
    <MotionProjectViewBody
      key={JSON.stringify([
        orgId,
        userId,
        sessionId,
        selectedBrand?.id,
        projectId,
      ])}
      projectId={projectId}
    />
  );
}

function MotionProjectViewBody({
  projectId,
}: MotionProjectViewProps): ReactElement {
  const t = useTranslations('pages.studioMotion');
  const { href } = useOrgUrl();
  const controller = useMotionComposer({ projectId });
  const {
    api,
    cancelCurrent,
    current,
    historyCursor,
    isActive,
    isBusy,
    isModuleWorkEnabled,
    loadOlderRevisions,
    loadPropsForEditing,
    loadSourceForEditing,
    modulePreferences,
    project,
    revision,
    revisions,
    selectRevision,
    source,
    viewSource,
  } = controller;

  return (
    <Container
      label={project?.label ?? t('title')}
      right={
        <Button asChild variant={ButtonVariant.SECONDARY}>
          <Link href={href(APP_ROUTES.STUDIO.MOTION)}>{t('allProjects')}</Link>
        </Button>
      }
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {isModuleWorkEnabled ? null : <MotionNotice controller={controller} />}
        {api.project.isLoading ? <p role="status">{t('loading')}</p> : null}
        {project && (
          <section className="space-y-3" aria-label={t('history')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="gen-heading-sm">{project.label}</h2>
              <span role="status" aria-live="polite" className="text-sm">
                {current?.status} · {current?.progress ?? 0}%
              </span>
            </div>
            <SegmentedControl
              appearance="chip"
              ariaLabel={t('history')}
              onValueChange={selectRevision}
              options={revisions.map((item) => ({
                label: `${t('revision', { number: item.number })} · ${item.status}`,
                value: item.id,
              }))}
              value={revision?.id}
            />
            {(historyCursor === undefined
              ? project.nextRevisionCursor
              : historyCursor) != null && (
              <Button
                variant={ButtonVariant.GHOST}
                disabled={isBusy}
                onClick={loadOlderRevisions}
              >
                {t('olderRevisions')}
              </Button>
            )}
            {revision && (
              <>
                <p className="text-sm text-muted-foreground">
                  {t('cost', {
                    consumed: revision.consumedCredits,
                    maximum: revision.maximumCredits,
                  })}{' '}
                  {t('rendererProvenance', {
                    model: revision.modelKey ?? '—',
                    version: revision.rendererVersion,
                  })}
                </p>
                {Array.from(new Set(revision.diagnostics ?? [])).map(
                  (message) => (
                    <p key={message} className="text-sm text-muted-foreground">
                      {message}
                    </p>
                  ),
                )}
                <div className="grid gap-3 sm:grid-cols-3">
                  {(revision.previews ?? []).map((media, index) => (
                    <Image
                      key={media.url}
                      unoptimized
                      src={media.url}
                      width={media.width}
                      height={media.height}
                      alt={t('preview', { number: index + 1 })}
                      className="h-auto w-full rounded-lg border border-border"
                    />
                  ))}
                </div>
                <div className="space-y-3">
                  {revision.outputs.map((media, index) => (
                    <div
                      key={media.ingredientId ?? media.url}
                      className="space-y-2"
                    >
                      {media.format === 'mp4' ? (
                        <VideoPlayer
                          config={{
                            controls: true,
                            muted: false,
                            loop: false,
                            playsInline: true,
                            preload: 'metadata',
                          }}
                          src={media.url}
                          className="max-h-96 w-full rounded-lg"
                          ariaLabel={t('videoOutput')}
                        />
                      ) : (
                        <Image
                          unoptimized
                          src={media.url}
                          width={media.width}
                          height={media.height}
                          alt={t('output', { number: index + 1 })}
                          className="h-auto max-h-96 w-auto rounded-lg"
                        />
                      )}
                      <Link
                        className="text-sm underline"
                        href={href(
                          `/library?ingredient=${encodeURIComponent(media.ingredientId ?? '')}`,
                        )}
                      >
                        {t('openLibrary')}
                      </Link>
                      <a
                        className="ml-4 text-sm underline"
                        href={media.url}
                        download
                      >
                        {t('download')}
                      </a>
                      {modulePreferences?.editor === true &&
                        media.format === 'mp4' &&
                        media.ingredientId && (
                          <Link
                            className="ml-4 text-sm underline"
                            href={href(
                              `${APP_ROUTES.STUDIO.EDITOR}?video=${encodeURIComponent(media.ingredientId)}`,
                            )}
                          >
                            {t('openEditor')}
                          </Link>
                        )}
                    </div>
                  ))}
                </div>
                {revision.hasSource && (
                  <Button
                    variant={ButtonVariant.SECONDARY}
                    disabled={isBusy}
                    onClick={() => viewSource(revision.number)}
                  >
                    {t('viewSource')}
                  </Button>
                )}
                {isModuleWorkEnabled && (
                  <div className="flex gap-2">
                    {revision.hasSource && (
                      <Button
                        variant={ButtonVariant.SECONDARY}
                        disabled={isBusy}
                        onClick={() => loadSourceForEditing(revision.number)}
                      >
                        {t('loadSource')}
                      </Button>
                    )}
                    <Button
                      variant={ButtonVariant.SECONDARY}
                      onClick={() => loadPropsForEditing(revision)}
                    >
                      {t('loadProps')}
                    </Button>
                  </div>
                )}
                {source !== null && (
                  <div className="space-y-2">
                    <Textarea
                      isReadOnly
                      aria-label={t('retainedSource')}
                      value={source}
                      rows={14}
                      className="font-mono text-xs"
                    />
                    <Button
                      variant={ButtonVariant.SECONDARY}
                      onClick={() => {
                        const url = URL.createObjectURL(
                          new Blob([source], { type: 'text/plain' }),
                        );
                        const anchor = document.createElement('a');
                        anchor.href = url;
                        anchor.download = `visual-revision-${revision.number}.tsx`;
                        anchor.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      {t('downloadSource')}
                    </Button>
                  </div>
                )}
                {isActive && (
                  <Button
                    disabled={isBusy}
                    variant={ButtonVariant.SECONDARY}
                    onClick={cancelCurrent}
                  >
                    {t('cancel')}
                  </Button>
                )}
              </>
            )}
          </section>
        )}
        <OrganizationModulePreferenceGate moduleId="motion">
          <MotionComposer controller={controller} />
        </OrganizationModulePreferenceGate>
      </div>
    </Container>
  );
}

'use client';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonVariant,
  formatEnumLabel,
  TurboProjectItemStatus,
  TurboProjectKind,
  TurboProjectStatus,
  TurboProjectStep,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { IngredientsService } from '@services/content/ingredients.service';
import CollectionGrid from '@ui/collection/CollectionGrid';
import CollectionSection from '@ui/collection/CollectionSection';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import TurboIdeasEditor from './TurboIdeasEditor';
import TurboProjectItemCard from './TurboProjectItemCard';
import TurboSchedule from './TurboSchedule';
import TurboWorkflowInputs from './TurboWorkflowInputs';
import type { TurboProjectPageProps } from './turbo-project.types';
import { isBrandReadyForTurbo } from './turbo-readiness';
import { useTurboProject } from './useTurboProject';

export default function TurboProjectPage({ projectId }: TurboProjectPageProps) {
  const t = useTranslations('pages.turboProjects');
  const locale = useLocale();
  const { brandId, selectedBrand, credentials } = useBrand();
  const { href } = useOrgUrl();
  const isIdeasEnabled = useFeatureFlag('turbo_ideas');
  const {
    project,
    error,
    isSaving,
    write,
    update,
    retrySave,
    hasUnsavedChanges,
  } = useTurboProject(projectId, brandId);
  const getUploads = useAuthedService((token: string) => ({
    images: IngredientsService.getInstance('images', token),
    videos: IngredientsService.getInstance('videos', token),
  }));
  const [notice, setNotice] = useState<string | null>(null);
  if (!project)
    return (
      <Container label={t('title')}>
        <p role={error ? 'alert' : 'status'}>{error || t('loading')}</p>
      </Container>
    );
  const ideas = project.kind === TurboProjectKind.IDEAS;
  const draft = project.status === TurboProjectStatus.DRAFT;
  const settings = project.settings.ideas ?? {
    formats: ['image' as const],
    count: 6,
  };
  const readiness = isBrandReadyForTurbo(
    selectedBrand,
    credentials,
    settings.formats,
  );
  const blocked = isSaving || hasUnsavedChanges;
  const items = project.items ?? [];
  const quote = project.quote;
  const canGenerate = !ideas || (isIdeasEnabled && readiness.ready);
  const steps = [
    ideas ? TurboProjectStep.IDEAS : TurboProjectStep.INPUTS,
    TurboProjectStep.REVIEW,
    TurboProjectStep.SCHEDULE,
  ];
  function requestStart(itemId?: string) {
    void write(async (api) => {
      if (ideas) {
        await api.quote(projectId, itemId);
        return api.get(projectId);
      }
      return itemId ? api.retry(projectId, itemId) : api.start(projectId);
    });
  }
  function acceptQuote() {
    if (!quote) return;
    const failed = quote.items.find((line) =>
      items.some(
        (item) =>
          item.id === line.itemId &&
          item.status === TurboProjectItemStatus.FAILED,
      ),
    );
    void write((api) =>
      failed
        ? api.retry(projectId, failed.itemId, quote.id)
        : api.start(projectId, quote.id),
    );
  }
  function upload(files: File[]) {
    for (const file of files) {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        setNotice(t('invalidFile'));
        continue;
      }
      let ingredientId: string | undefined;
      void write(
        async (api) => {
          const category = file.type.startsWith('video/') ? 'videos' : 'images';
          const form = new FormData();
          form.append('file', file);
          form.append(
            'category',
            file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE',
          );
          form.append('brand', brandId);
          if (!ingredientId) {
            const ingredient = await (await getUploads())[category].postUpload(
              form,
              undefined,
              { handledErrorStatuses: [413, 415, 422] },
            );
            ingredientId = ingredient.id;
          }
          return api.addItems(projectId, {
            inputs: [{ ingredientId }],
          });
        },
        undefined,
        true,
      );
    }
  }
  return (
    <Container
      label={t('title')}
      right={
        <Button asChild variant={ButtonVariant.SECONDARY}>
          <Link href={href(APP_ROUTES.STUDIO.TURBO)}>{t('all')}</Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        <Field label={t('name')}>
          <Input
            aria-label={t('name')}
            value={project.name}
            maxLength={120}
            onChange={(event) => {
              if (event.target.value.trim())
                void update({ name: event.target.value });
            }}
          />
        </Field>
        <div className="flex flex-wrap gap-3 text-sm">
          <span>{formatEnumLabel(project.status)}</span>
          <span role="status">
            {isSaving
              ? t('saving')
              : hasUnsavedChanges
                ? t('unsaved')
                : t('saved')}
          </span>
          {project.reviewTurboRunId && (
            <Button asChild variant={ButtonVariant.LINK}>
              <Link href={href(APP_ROUTES.PUBLISHING.REVIEW)}>
                {t('reviewInbox')}
              </Link>
            </Button>
          )}
        </div>
        {error && (
          <div role="alert">
            <p>{error}</p>
            <Button
              variant={ButtonVariant.SECONDARY}
              onClick={() => void retrySave()}
            >
              {t('retrySave')}
            </Button>
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
        <div className="flex flex-wrap gap-2">
          {steps.map((step) => (
            <Button
              key={step}
              variant={
                project.step === step
                  ? ButtonVariant.DEFAULT
                  : ButtonVariant.SECONDARY
              }
              onClick={() => void update({ step })}
            >
              {t(step)}
            </Button>
          ))}
        </div>
        {ideas && !isIdeasEnabled && <p role="alert">{t('ideasDisabled')}</p>}
        {ideas && !readiness.ready && (
          <CollectionSection title={t('readiness')}>
            <ul className="space-y-2">
              {readiness.reasons.map((reason) => (
                <li key={reason}>
                  <Button asChild variant={ButtonVariant.LINK}>
                    <Link
                      href={href(
                        reason.includes('connected')
                          ? APP_ROUTES.SETTINGS.CONNECTED_ACCOUNTS
                          : reason.includes('reference') ||
                              reason.includes('tone')
                            ? APP_ROUTES.SETTINGS.BRANDS
                            : APP_ROUTES.SETTINGS.AGENT,
                      )}
                    >
                      {reason}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </CollectionSection>
        )}
        {draft && project.step === TurboProjectStep.IDEAS && (
          <TurboIdeasEditor
            settings={settings}
            canGenerate={!blocked && readiness.ready}
            disabled={!isIdeasEnabled}
            onChange={(next) => void update({ settings: { ideas: next } })}
            onGenerate={() => {
              if (!blocked && readiness.ready)
                void write((api) => api.generateIdeas(projectId, settings));
            }}
          />
        )}
        {draft && project.step === TurboProjectStep.INPUTS && (
          <TurboWorkflowInputs disabled={blocked} onUpload={upload} />
        )}
        {draft && items.length > 0 && (
          <Button
            isDisabled={blocked || !canGenerate}
            onClick={() => requestStart()}
          >
            {ideas ? t('getQuote') : t('startWorkflow')}
          </Button>
        )}
        {quote && !quote.acceptedAt && (
          <CollectionSection title={t('quote')}>
            <p>
              {t('quoteTotal', {
                credits: quote.total,
                count: quote.items.length,
              })}
            </p>
            <ul>
              {quote.items.map((line) => (
                <li key={line.key}>
                  {line.format} · {line.model} · {line.credits} {t('credits')}{' '}
                  {line.billingMode === 'byok' ? t('byok') : ''}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {t('quoteExpiry', {
                date: new Date(quote.expiresAt).toLocaleString(locale),
              })}
            </p>
            <Button
              isDisabled={
                blocked ||
                !canGenerate ||
                Date.parse(quote.expiresAt) <= Date.now()
              }
              onClick={acceptQuote}
            >
              {t('acceptQuote')}
            </Button>
          </CollectionSection>
        )}
        <CollectionSection
          title={t('items')}
          itemCount={items.length}
          isCountVisible
        >
          <CollectionGrid maxColumns={3}>
            {items.map((item) => (
              <TurboProjectItemCard
                key={item.id}
                item={item}
                isDraft={draft}
                disabled={blocked}
                onRemove={() =>
                  void write((api) => api.removeItem(projectId, item.id))
                }
                onRetry={() => requestStart(item.id)}
                onCaption={(caption) =>
                  void write(
                    (api) => api.updateCaption(projectId, item.id, caption),
                    (current) => ({
                      ...current,
                      items: current.items?.map((entry) =>
                        entry.id === item.id ? { ...entry, caption } : entry,
                      ),
                    }),
                    true,
                    `caption:${item.id}`,
                  )
                }
                onReview={(decision) =>
                  void write((api) =>
                    api.review(projectId, { itemIds: [item.id], decision }),
                  )
                }
              />
            ))}
          </CollectionGrid>
        </CollectionSection>
        {project.step === TurboProjectStep.SCHEDULE && (
          <CollectionSection title={t('schedule')}>
            <TurboSchedule
              targets={project.settings.schedule?.targets ?? []}
              credentials={credentials}
              canSchedule={
                !blocked &&
                items.some(
                  (item) => item.status === TurboProjectItemStatus.APPROVED,
                )
              }
              disabled={false}
              onChange={(targets) =>
                void update({
                  settings: {
                    schedule: { ...project.settings.schedule, targets },
                  },
                })
              }
              onSchedule={() => {
                if (
                  blocked ||
                  !items.some(
                    (item) => item.status === TurboProjectItemStatus.APPROVED,
                  )
                )
                  return;
                void write(async (api) => {
                  const targets = (project.settings.schedule?.targets ?? [])
                    .filter(
                      (target) =>
                        target.isSelected &&
                        credentials.some(
                          (credential) => credential.id === target.credentialId,
                        ),
                    )
                    .map(({ credentialId, platform, scheduledDate }) => ({
                      credentialId,
                      platform,
                      ...(scheduledDate ? { scheduledDate } : {}),
                    }));
                  const result = await api.schedule(projectId, {
                    targets,
                    timezone:
                      Intl.DateTimeFormat(locale).resolvedOptions().timeZone,
                  });
                  setNotice(
                    t('scheduleResult', {
                      scheduled: result.scheduledCount,
                      failed: result.failedCount,
                    }),
                  );
                  return api.get(projectId);
                });
              }}
            />
          </CollectionSection>
        )}
      </div>
    </Container>
  );
}

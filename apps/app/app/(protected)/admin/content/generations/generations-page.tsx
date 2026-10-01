'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Ingredient } from '@models/content/ingredient.model';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

const GENERATION_SKELETON_KEYS = [
  'generation-skeleton-1',
  'generation-skeleton-2',
  'generation-skeleton-3',
  'generation-skeleton-4',
] as const;

function readPromptField(
  prompt: IIngredient['prompt'],
  field: 'original' | 'enhanced',
): string {
  if (!prompt || typeof prompt === 'string') {
    return '';
  }
  const value = prompt[field];
  return typeof value === 'string' ? value : '';
}

function readUserLabel(user: IIngredient['user']): string {
  if (!user) {
    return '';
  }
  if (typeof user === 'string') {
    return user;
  }
  return user.email || user.handle || user.id || '';
}

function readOrganizationLabel(
  organization: IIngredient['organization'],
): string {
  if (!organization) {
    return '';
  }
  if (typeof organization === 'string') {
    return organization;
  }
  return organization.label || organization.id || '';
}

function readResultImageUrl(ingredient: Ingredient): string {
  return ingredient.cdnUrl || ingredient.ingredientUrl || '';
}

function GenerationsPageContent() {
  const t = useTranslations('pages.adminGenerations');
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString() ?? '';
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );
  const currentPage = Number(parsedSearchParams.get('page')) || 1;

  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance('ingredients', token),
  );
  const notificationsService = NotificationsService.getInstance();

  const [generations, setGenerations] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadGenerations = useCallback(
    async (signal: AbortSignal) => {
      setIsLoading(true);

      try {
        const service = await getIngredientsService();
        const fetched = await service.findAdminGenerationReviews(
          {
            limit: ITEMS_PER_PAGE,
            page: currentPage,
            sort: 'createdAt: -1',
          },
          signal,
        );

        if (signal.aborted) {
          return;
        }

        setGenerations(Array.isArray(fetched) ? fetched : []);
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        logger.error('Failed to load generation reviews', error);
        notificationsService.error(t('loadError'));
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [getIngredientsService, notificationsService, currentPage, t],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadGenerations(controller.signal);
    return () => controller.abort();
  }, [loadGenerations]);

  return (
    <WorkspaceSurface
      title={t('title')}
      tone="muted"
      data-testid="content-generations-surface"
    >
      <div className="grid gap-4">
        {isLoading ? (
          GENERATION_SKELETON_KEYS.map((key) => (
            <SkeletonCard key={key} showImage />
          ))
        ) : generations.length === 0 ? (
          <CardEmptyContent label={t('empty')} />
        ) : (
          <>
            {generations.map((ingredient) => {
              const original = readPromptField(ingredient.prompt, 'original');
              const enhanced = readPromptField(ingredient.prompt, 'enhanced');
              const imageUrl = readResultImageUrl(ingredient);
              const model = ingredient.modelUsed || ingredient.model || '';

              return (
                <Card key={ingredient.id}>
                  <div className="grid gap-4 p-6 md:grid-cols-[16rem_minmax(0,1fr)]">
                    <div className="overflow-hidden rounded-md bg-foreground/5">
                      {imageUrl ? (
                        <Image
                          alt={original || t('resultAlt')}
                          className="aspect-square w-full object-cover"
                          height={256}
                          src={imageUrl}
                          unoptimized
                          width={256}
                        />
                      ) : (
                        <div className="flex aspect-square items-center justify-center text-sm text-foreground/60">
                          {t('noImage')}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        {ingredient.status ? (
                          <Badge variant="outline">{ingredient.status}</Badge>
                        ) : null}
                        {model ? (
                          <span className="text-xs text-foreground/60">
                            {model}
                          </span>
                        ) : null}
                      </div>
                      <p className="mb-3 text-sm text-foreground/60">
                        {readUserLabel(ingredient.user)}
                        {readOrganizationLabel(ingredient.organization)
                          ? ` · ${readOrganizationLabel(ingredient.organization)}`
                          : ''}
                      </p>
                      {original ? (
                        <div className="mb-3">
                          <p className="mb-1 font-medium">{t('original')}</p>
                          <p className="whitespace-pre-wrap text-foreground/80">
                            {original}
                          </p>
                        </div>
                      ) : null}
                      {enhanced ? (
                        <div className="mb-3">
                          <p className="mb-1 font-medium">{t('enhanced')}</p>
                          <p className="whitespace-pre-wrap text-foreground/80">
                            {enhanced}
                          </p>
                        </div>
                      ) : null}
                      {ingredient.generationPrompt ? (
                        <div>
                          <p className="mb-1 font-medium">{t('compiled')}</p>
                          <p className="whitespace-pre-wrap text-foreground/80">
                            {ingredient.generationPrompt}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Card>
              );
            })}
            <AutoPagination />
          </>
        )}
      </div>
    </WorkspaceSurface>
  );
}

export default function GenerationsPage() {
  return (
    <Suspense fallback={null}>
      <GenerationsPageContent />
    </Suspense>
  );
}

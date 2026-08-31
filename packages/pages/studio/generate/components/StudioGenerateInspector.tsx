'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant, IngredientStatus } from '@genfeedai/enums';
import type { IIngredient, IPost } from '@genfeedai/interfaces';
import type { StudioGenerateInspectorProps } from '@genfeedai/props/studio/studio-generate.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  formatStudioRecipePrompt,
  resolveRecipeForJob,
} from '@pages/studio/generate/utils/studio-generate-recipe';
import { getStudioGenerateTypeConfig } from '@pages/studio/generate/utils/studio-generate-types';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { Button } from '@ui/primitives/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/primitives/tabs';
import { Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactElement, useEffect, useMemo, useState } from 'react';

/**
 * Right rail for a selected generation: the enriched Recipe, posts that use
 * the asset, and the other outputs in this run.
 */
export default function StudioGenerateInspector({
  job,
  onClose,
  onSelect,
  onVary,
  runJobs,
}: StudioGenerateInspectorProps): ReactElement {
  const translate = useTranslations('pages.studioGenerate');
  const { href } = useOrgUrl();
  const { label } = getStudioGenerateTypeConfig(job.type);
  const recipe = resolveRecipeForJob(job);
  const recipeText = recipe ? formatStudioRecipePrompt(recipe) : '';
  const promptText = recipeText || job.prompt.trim();
  const siblingJobs = useMemo(
    () => runJobs.filter((candidate) => candidate.id !== job.id),
    [job.id, runJobs],
  );
  const ingredientId = job.ingredientId;
  const [posts, setPosts] = useState<IPost[]>([]);
  const [children, setChildren] = useState<IIngredient[]>([]);
  const [isLoadingUsedIn, setIsLoadingUsedIn] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  useEffect(() => {
    if (!ingredientId) {
      setPosts([]);
      setChildren([]);
      setIsLoadingUsedIn(false);
      setIsLoadingHistory(false);
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    setIsLoadingUsedIn(true);
    setIsLoadingHistory(true);

    void (async () => {
      try {
        const service = await getIngredientsService();
        const [usedIn, historyChildren] = await Promise.all([
          service.getPosts(ingredientId),
          service.findChildren(ingredientId),
        ]);

        if (isCancelled || controller.signal.aborted) {
          return;
        }

        setPosts(usedIn);
        setChildren(historyChildren);
      } catch (error) {
        if (!isCancelled) {
          logger.error('Failed to load Studio inspector relations', error);
          setPosts([]);
          setChildren([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingUsedIn(false);
          setIsLoadingHistory(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [getIngredientsService, ingredientId]);

  return (
    <aside
      aria-label={translate('inspector.title')}
      className="flex w-80 shrink-0 flex-col overflow-hidden border-l border-border bg-background"
      data-testid="studio-generate-inspector"
    >
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {label}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {job.modelKey || translate('inspector.autoModel')}
          </p>
        </div>
        <Button
          ariaLabel={translate('inspector.close')}
          icon={<X className="size-4" />}
          onClick={onClose}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </div>

      <Tabs
        className="flex min-h-0 flex-1 flex-col"
        defaultValue="recipe"
        key={job.id}
      >
        <TabsList
          aria-label={translate('inspector.title')}
          className="w-full justify-start px-2"
          data-variant="underline"
        >
          <TabsTrigger data-size="sm" data-variant="underline" value="recipe">
            {translate('inspector.recipe')}
          </TabsTrigger>
          <TabsTrigger data-size="sm" data-variant="underline" value="used-in">
            {translate('inspector.usedIn')}
          </TabsTrigger>
          <TabsTrigger data-size="sm" data-variant="underline" value="history">
            {translate('inspector.history')}
          </TabsTrigger>
        </TabsList>

        <TabsContent
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
          value="recipe"
        >
          {promptText ? (
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground/80">
              {promptText}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">
              {translate('inspector.emptyRecipe')}
            </p>
          )}
        </TabsContent>

        <TabsContent
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
          value="used-in"
        >
          {isLoadingUsedIn ? (
            <p className="text-xs text-muted-foreground">
              {translate('inspector.loading')}
            </p>
          ) : posts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {translate('inspector.emptyUsedIn')}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {posts.map((post) => (
                <li key={post.id}>
                  <Link
                    className="block truncate text-xs text-foreground hover:underline"
                    href={href(`${APP_ROUTES.PUBLISHING.POSTS}/${post.id}`)}
                  >
                    {post.label || post.id}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
          value="history"
        >
          {siblingJobs.length === 0 &&
          children.length === 0 &&
          !isLoadingHistory ? (
            <p className="text-xs text-muted-foreground">
              {translate('inspector.emptyHistory')}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {siblingJobs.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-2xs uppercase tracking-[0.12em] text-foreground/35">
                    {translate('inspector.runSiblings')}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {siblingJobs.map((sibling) => (
                      <li key={sibling.id}>
                        <Button
                          className="h-auto w-full justify-start truncate px-0 text-xs text-foreground hover:underline"
                          label={sibling.prompt || sibling.id}
                          onClick={() => onSelect(sibling)}
                          variant={ButtonVariant.UNSTYLED}
                          withWrapper={false}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {isLoadingHistory ? (
                <p className="text-xs text-muted-foreground">
                  {translate('inspector.loading')}
                </p>
              ) : children.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-2xs uppercase tracking-[0.12em] text-foreground/35">
                    {translate('inspector.childAssets')}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {children.map((child) => (
                      <li
                        className="truncate text-xs text-foreground/80"
                        key={child.id}
                      >
                        {child.metadataLabel || child.promptText || child.id}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {job.status !== IngredientStatus.PROCESSING ? (
        <div className="border-t border-border px-4 py-3">
          <Button
            className="w-full"
            icon={<Sparkles className="size-3.5" />}
            label={translate('inspector.vary')}
            onClick={() => onVary(job)}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          />
        </div>
      ) : null}
    </aside>
  );
}

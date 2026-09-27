'use client';

import { attachContentToNewConversationDraft } from '@genfeedai/agent/stores/conversation-composer-draft.store';
import {
  ButtonSize,
  ButtonVariant,
  IngredientStatus,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IIngredient, IPost } from '@genfeedai/contracts/interfaces';
import type { StudioGenerateInspectorProps } from '@genfeedai/props/studio/studio-generate.props';
import { DATE_FORMATS, formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  resolveStudioAssetFacts,
  resolveStudioAssetUrl,
} from '@pages/studio/generate/utils/studio-generate-asset';
import {
  formatStudioRecipePrompt,
  resolveRecipeForJob,
} from '@pages/studio/generate/utils/studio-generate-recipe';
import { getStudioGenerateTypeConfig } from '@pages/studio/generate/utils/studio-generate-types';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { ImagesService } from '@services/ingredients/images.service';
import { VideosService } from '@services/ingredients/videos.service';
import AudioPreviewPlayer from '@ui/audio/preview-player/AudioPreviewPlayer';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import GenerationHarnessReceipt from '@ui/ingredients/tabs/prompts/GenerationHarnessReceipt';
import { createDownloadHandler } from '@ui/masonry/shared/useMasonryHover';
import { PanelTabs } from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import { Download, MessageSquare, Send, Shuffle, Sparkles } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

type InspectorTab = 'history' | 'recipe' | 'used-in';

const AUDIO_TYPES = new Set(['music', 'voice']);
const REMIXABLE_TYPES = new Set(['image', 'video']);
const downloadIngredient = createDownloadHandler();

function isInspectorTab(value: string): value is InspectorTab {
  return value === 'history' || value === 'recipe' || value === 'used-in';
}

/**
 * The asset renderer inside the shell's context sidebar: preview and facts on
 * top, Recipe / Used in / History below, actions pinned to the bottom. Title,
 * model and close live in the sidebar header.
 */
export default function StudioGenerateInspector({
  job,
  onRemix,
  onSelect,
  onUseInPost,
  onVary,
  runJobs,
}: StudioGenerateInspectorProps): ReactElement {
  const translate = useTranslations('pages.studioGenerate');
  const { href, orgSlug } = useOrgUrl();
  const { push } = useRouter();
  const { label } = getStudioGenerateTypeConfig(job.type);
  const recipe = resolveRecipeForJob(job);
  const recipeText = recipe ? formatStudioRecipePrompt(recipe) : '';
  const promptText = recipeText || job.prompt.trim();
  const facts = resolveStudioAssetFacts(job);
  const siblingJobs = useMemo(
    () => runJobs.filter((candidate) => candidate.id !== job.id),
    [job.id, runJobs],
  );
  const ingredientId = job.ingredientId;
  const ingredient = job.ingredient ?? null;
  const previewUrl = resolveStudioAssetUrl(ingredient) ?? job.url;
  const isReady =
    job.status !== IngredientStatus.PROCESSING &&
    job.status !== IngredientStatus.FAILED;
  const [receiptAsset, setReceiptAsset] = useState<IIngredient | null>(null);
  const [receiptError, setReceiptError] = useState(false);
  const [posts, setPosts] = useState<IPost[]>([]);
  const [children, setChildren] = useState<IIngredient[]>([]);
  const [isLoadingUsedIn, setIsLoadingUsedIn] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [tabSelection, setTabSelection] = useState<{
    jobId: string;
    tab: InspectorTab;
  }>({ jobId: job.id, tab: 'recipe' });
  const activeTab = tabSelection.jobId === job.id ? tabSelection.tab : 'recipe';

  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );
  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );
  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
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

  useEffect(() => {
    const controller = new AbortController();
    setReceiptAsset(null);
    setReceiptError(false);
    // Only image and video generations carry a harness receipt, and the API
    // reads a single asset through its category route; there is no generic
    // single-ingredient read.
    const getReceiptService =
      job.type === 'image'
        ? getImagesService
        : job.type === 'video' || job.type === 'avatar'
          ? getVideosService
          : null;
    if (!ingredientId || !getReceiptService) return () => controller.abort();
    void (async () => {
      try {
        const service = await getReceiptService();
        if (controller.signal.aborted) return;
        const asset = await service.findOne(
          ingredientId,
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) setReceiptAsset(asset);
      } catch {
        if (!controller.signal.aborted) setReceiptError(true);
      }
    })();
    return () => controller.abort();
  }, [getImagesService, getVideosService, ingredientId, job.type]);

  // The asset rides the next new conversation's attachment tray; nothing is
  // sent until the operator writes the question.
  const handleAskAgent = useCallback(() => {
    if (!ingredient) {
      return;
    }

    attachContentToNewConversationDraft(orgSlug, {
      contentTitle: job.prompt.trim() || label,
      contentType: job.type,
      id: ingredient.id,
      ...(ingredient.thumbnailUrl
        ? { thumbnailUrl: ingredient.thumbnailUrl }
        : {}),
    });
    push(href(APP_ROUTES.AGENT.NEW));
  }, [href, ingredient, job.prompt, job.type, label, orgSlug, push]);

  const factRows = [
    { key: 'type', label: translate('inspector.facts.type'), value: label },
    {
      key: 'model',
      label: translate('inspector.facts.model'),
      value: facts.modelLabel || translate('inspector.autoModel'),
    },
    ...(facts.aspectRatio
      ? [
          {
            key: 'aspect',
            label: translate('inspector.facts.aspect'),
            value: facts.aspectRatio,
          },
        ]
      : []),
    ...(facts.durationSeconds
      ? [
          {
            key: 'duration',
            label: translate('inspector.facts.duration'),
            value: translate('inspector.durationSeconds', {
              seconds: Math.round(facts.durationSeconds),
            }),
          },
        ]
      : []),
    ...(facts.createdAt
      ? [
          {
            key: 'created',
            label: translate('inspector.facts.created'),
            value: formatDate(facts.createdAt, DATE_FORMATS.DISPLAY_DATETIME),
          },
        ]
      : []),
    ...(facts.brandLabel
      ? [
          {
            key: 'brand',
            label: translate('inspector.facts.brand'),
            value: facts.brandLabel,
          },
        ]
      : []),
  ];

  let preview: ReactNode = null;
  if (isReady && previewUrl) {
    if (AUDIO_TYPES.has(job.type)) {
      preview = (
        <AudioPreviewPlayer
          audioUrl={previewUrl}
          className="w-full"
          isTimelineVisible
          label={job.prompt || label}
        />
      );
    } else if (job.type === 'image') {
      preview = (
        <div className="relative aspect-video w-full overflow-hidden rounded-md bg-foreground/[0.04]">
          <Image
            alt={translate('inspector.previewAlt', { label })}
            className="object-contain"
            fill
            sizes="480px"
            src={previewUrl}
          />
        </div>
      );
    } else {
      preview = (
        <VideoPlayer
          ariaLabel={translate('inspector.previewAlt', { label })}
          className="aspect-video w-full overflow-hidden rounded-md bg-foreground/[0.04]"
          config={{
            controls: true,
            loop: false,
            muted: true,
            playsInline: true,
            preload: 'metadata',
          }}
          src={previewUrl}
          thumbnail={ingredient?.thumbnailUrl}
        />
      );
    }
  }

  const recipePanel = (
    <div className="flex flex-col gap-3 px-4 py-3">
      {receiptAsset &&
      receiptAsset.id === ingredientId &&
      receiptAsset.generationHarness ? (
        <GenerationHarnessReceipt receipt={receiptAsset.generationHarness} />
      ) : null}
      {receiptError ? (
        <p role="status" className="text-xs text-muted-foreground">
          {translate('inspector.receiptLoadError')}
        </p>
      ) : null}
      {promptText ? (
        <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground/80">
          {promptText}
        </pre>
      ) : (
        <p className="text-xs text-muted-foreground">
          {translate('inspector.emptyRecipe')}
        </p>
      )}
    </div>
  );

  const usedInPanel = (
    <div className="px-4 py-3">
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
    </div>
  );

  const historyPanel = (
    <div className="px-4 py-3">
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
    </div>
  );

  const actions = isReady ? (
    <div
      aria-label={translate('inspector.actions')}
      className="grid shrink-0 grid-cols-2 gap-2 border-t border-border px-4 py-3"
      role="group"
    >
      <Button
        className="w-full"
        icon={<Sparkles className="size-3.5" />}
        label={translate('inspector.vary')}
        onClick={() => onVary(job)}
        size={ButtonSize.SM}
        variant={ButtonVariant.SECONDARY}
        withWrapper={false}
      />
      {ingredient && REMIXABLE_TYPES.has(job.type) ? (
        <Button
          className="w-full"
          icon={<Shuffle className="size-3.5" />}
          label={translate('inspector.remix')}
          onClick={() => onRemix(job)}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        />
      ) : null}
      {ingredient ? (
        <>
          <Button
            className="w-full"
            icon={<Send className="size-3.5" />}
            label={translate('inspector.useInPost')}
            onClick={() => onUseInPost(ingredient)}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          />
          <Button
            className="w-full"
            icon={<Download className="size-3.5" />}
            label={translate('inspector.download')}
            onClick={() => void downloadIngredient(ingredient)}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          />
          <Button
            className="col-span-2 w-full"
            icon={<MessageSquare className="size-3.5" />}
            label={translate('inspector.askAgent')}
            onClick={handleAskAgent}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        </>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="studio-generate-inspector"
    >
      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-4">
        {preview}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
          {factRows.map((row) => (
            <div className="contents" key={row.key}>
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="truncate text-right text-foreground/80">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <PanelTabs
        activeTab={activeTab}
        ariaLabel={translate('inspector.title')}
        className="h-auto min-h-48 flex-1"
        footer={actions}
        items={[
          {
            content: recipePanel,
            id: 'recipe',
            isOpen: true,
            label: translate('inspector.recipe'),
          },
          {
            content: usedInPanel,
            id: 'used-in',
            isOpen: true,
            label: translate('inspector.usedIn'),
          },
          {
            content: historyPanel,
            id: 'history',
            isOpen: true,
            label: translate('inspector.history'),
          },
        ]}
        onTabChange={(tab) => {
          if (isInspectorTab(tab)) {
            setTabSelection({ jobId: job.id, tab });
          }
        }}
        testId="studio-generate-inspector-tabs"
      />
    </div>
  );
}

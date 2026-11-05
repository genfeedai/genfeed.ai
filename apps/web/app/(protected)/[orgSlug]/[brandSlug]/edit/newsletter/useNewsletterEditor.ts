import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Newsletter } from '@models/content/newsletter.model';
import { NewslettersService } from '@services/content/newsletters.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';
import type {
  NewsletterContextPreview,
  NewsletterEditorLoadingAction,
  NewsletterEditorState,
  UseNewsletterEditorReturn,
} from '@/props/content/artifact-editor.props';

export type { UseNewsletterEditorReturn } from '@/props/content/artifact-editor.props';

/** Newsletters publish to the email/newsletter channel rather than a social platform. */
const NEWSLETTER_PUBLISH_PLATFORM = 'newsletter';

function newsletterQueryKey(newsletterId: string) {
  return ['newsletter', newsletterId] as const;
}

function newsletterContextQueryKey(newsletterId: string) {
  return ['newsletter-context', newsletterId] as const;
}

function createNewslettersService(token: string): NewslettersService {
  return NewslettersService.getInstance(token);
}

function createEditorState(
  newsletter: Newsletter | null,
): NewsletterEditorState {
  return {
    angle: newsletter?.angle ?? '',
    content: newsletter?.content ?? '',
    label: newsletter?.label ?? '',
    summary: newsletter?.summary ?? '',
    topic: newsletter?.topic ?? '',
  };
}

function isEditorDirty(
  editorState: NewsletterEditorState,
  newsletter: Newsletter | null,
): boolean {
  if (!newsletter) {
    return false;
  }

  return (
    editorState.label !== (newsletter.label ?? '') ||
    editorState.topic !== (newsletter.topic ?? '') ||
    editorState.angle !== (newsletter.angle ?? '') ||
    editorState.summary !== (newsletter.summary ?? '') ||
    editorState.content !== (newsletter.content ?? '')
  );
}

/**
 * Loads and edits a single newsletter from its own route. The list page owns
 * discovery and generation; this hook owns everything that happens once a
 * specific issue is open.
 *
 * The issue and its context are cached per viewer and issue, so reopening it
 * paints the last copy at once and refreshes it in the background. A fresh
 * copy re-seeds the editor only while it has no unsaved changes.
 */
export function useNewsletterEditor(
  newsletterId: string,
): UseNewsletterEditorReturn {
  const notificationsService = NotificationsService.getInstance();
  const queryClient = useQueryClient();
  const newsletterQuery = useAuthedQuery<NewslettersService, Newsletter>({
    enabled: Boolean(newsletterId),
    queryFn: (service, signal) => service.findOne(newsletterId, {}, signal),
    queryKey: newsletterQueryKey(newsletterId),
    service: createNewslettersService,
  });
  const contextQuery = useAuthedQuery<
    NewslettersService,
    NewsletterContextPreview
  >({
    enabled: Boolean(newsletterId),
    queryFn: (service) => service.getContext(newsletterId),
    queryKey: newsletterContextQueryKey(newsletterId),
    service: createNewslettersService,
  });
  const newsletter = newsletterQuery.data ?? null;
  const contextPreview = contextQuery.data ?? null;
  const isLoading = newsletterQuery.isPending;
  const { error: loadError } = newsletterQuery;
  const { error: contextError } = contextQuery;
  const hasNewsletter = newsletter !== null;

  const [editorState, setEditorState] = useState<NewsletterEditorState>(() =>
    createEditorState(newsletter),
  );
  // The issue the editor was last seeded from. A fresh copy re-seeds it only
  // while it has no unsaved changes; another issue always re-seeds it.
  const [editorSource, setEditorSource] = useState({
    newsletter,
    newsletterId,
  });
  if (
    editorSource.newsletter !== newsletter ||
    editorSource.newsletterId !== newsletterId
  ) {
    setEditorSource({ newsletter, newsletterId });
    if (
      editorSource.newsletterId !== newsletterId ||
      !isEditorDirty(editorState, editorSource.newsletter)
    ) {
      setEditorState(createEditorState(newsletter));
    }
  }

  // A failed background refresh keeps the issue on screen without an alert.
  useEffect(() => {
    if (!loadError || hasNewsletter) {
      return;
    }
    logger.error('Failed to load newsletter', loadError);
    notificationsService.error('Failed to load newsletter');
  }, [hasNewsletter, loadError, notificationsService]);

  useEffect(() => {
    if (contextError) {
      logger.error('Failed to load newsletter context', contextError);
    }
  }, [contextError]);
  const [isSavingExternalUrl, setIsSavingExternalUrl] = useState(false);
  const [loadingAction, setLoadingAction] =
    useState<NewsletterEditorLoadingAction>(null);
  const actionInFlightRef = useRef(false);

  const beginAction = useCallback(
    (action: Exclude<NewsletterEditorLoadingAction, null>): boolean => {
      if (actionInFlightRef.current) {
        return false;
      }

      actionInFlightRef.current = true;
      setLoadingAction(action);
      return true;
    },
    [],
  );

  const finishAction = useCallback(() => {
    actionInFlightRef.current = false;
    setLoadingAction(null);
  }, []);

  const getService = useAuthedService(createNewslettersService);

  const writeNewsletter = useCallback(
    async (next: Newsletter) => {
      // A read still in flight would land the older issue after this write.
      await queryClient.cancelQueries({
        queryKey: newsletterQueryKey(next.id),
      });
      queryClient.setQueriesData<Newsletter>(
        { queryKey: newsletterQueryKey(next.id) },
        next,
      );
    },
    [queryClient],
  );

  /** A newsletter the user's action returned replaces the editor's fields. */
  const applyNewsletter = useCallback(
    (next: Newsletter) => {
      setEditorState(createEditorState(next));
      void writeNewsletter(next);
    },
    [writeNewsletter],
  );

  const loadContext = useCallback(
    (id: string) =>
      queryClient.invalidateQueries({
        queryKey: newsletterContextQueryKey(id),
      }),
    [queryClient],
  );

  const handleEditorChange = useCallback(
    (patch: Partial<NewsletterEditorState>) => {
      setEditorState((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!newsletter || !beginAction('saving')) {
      return;
    }

    try {
      const service = await getService();
      applyNewsletter(
        await service.patch(newsletter.id, {
          angle: editorState.angle || undefined,
          content: editorState.content,
          label: editorState.label.trim(),
          summary: editorState.summary || undefined,
          topic: editorState.topic.trim(),
        }),
      );
      notificationsService.success('Newsletter saved');
    } catch (error) {
      logger.error('Failed to save newsletter', error);
      notificationsService.error('Failed to save newsletter');
    } finally {
      finishAction();
    }
  }, [
    applyNewsletter,
    beginAction,
    editorState,
    finishAction,
    getService,
    newsletter,
    notificationsService,
  ]);

  const handleRegenerate = useCallback(async () => {
    if (!newsletter || actionInFlightRef.current) {
      return;
    }

    if (!editorState.topic.trim()) {
      notificationsService.error('Newsletter topic is required');
      return;
    }

    if (!beginAction('generatingDraft')) {
      return;
    }

    try {
      const service = await getService();
      const regenerated = await service.generateDraft({
        angle: editorState.angle || undefined,
        contextNewsletterIds:
          contextPreview && contextPreview.selectedContextIds.length > 0
            ? contextPreview.selectedContextIds
            : undefined,
        newsletterId: newsletter.id,
        topic: editorState.topic.trim(),
      });

      applyNewsletter(regenerated);
      await loadContext(regenerated.id);
      notificationsService.success('Newsletter regenerated');
    } catch (error) {
      logger.error('Failed to regenerate newsletter', error);
      notificationsService.error('Failed to regenerate newsletter');
    } finally {
      finishAction();
    }
  }, [
    applyNewsletter,
    beginAction,
    contextPreview,
    editorState,
    finishAction,
    getService,
    loadContext,
    newsletter,
    notificationsService,
  ]);

  const handleApprove = useCallback(
    async (id: string) => {
      if (!newsletter || !beginAction('approving')) {
        return;
      }

      try {
        const service = await getService();
        applyNewsletter(await service.approve(id));
        await loadContext(id);
        notificationsService.success('Newsletter approved');
      } catch (error) {
        logger.error('Failed to approve newsletter', error);
        notificationsService.error('Failed to approve newsletter');
      } finally {
        finishAction();
      }
    },
    [
      applyNewsletter,
      beginAction,
      finishAction,
      getService,
      loadContext,
      newsletter,
      notificationsService,
    ],
  );

  const handlePublish = useCallback(
    async (id: string) => {
      if (!newsletter || !beginAction('publishing')) {
        return;
      }

      try {
        const service = await getService();
        applyNewsletter(await service.publish(id));
        captureAnalyticsEvent(ANALYTICS_EVENTS.POST_PUBLISHED, {
          platform: NEWSLETTER_PUBLISH_PLATFORM,
        });
        captureAnalyticsEvent(ANALYTICS_EVENTS.FIRST_SUCCESSFUL_PUBLISH, {
          platform: NEWSLETTER_PUBLISH_PLATFORM,
          surface: 'newsletter',
        });
        await loadContext(id);
        notificationsService.success('Newsletter published');
      } catch (error) {
        logger.error('Failed to publish newsletter', error);
        notificationsService.error('Failed to publish newsletter');
      } finally {
        finishAction();
      }
    },
    [
      applyNewsletter,
      beginAction,
      finishAction,
      getService,
      loadContext,
      newsletter,
      notificationsService,
    ],
  );

  const handleDelivered = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: newsletterQueryKey(newsletterId),
      }),
      loadContext(newsletterId),
    ]);
  }, [loadContext, newsletterId, queryClient]);

  const handleSaveExternalUrl = useCallback(
    async (externalUrl: string | null) => {
      if (!newsletter) {
        return;
      }

      setIsSavingExternalUrl(true);
      try {
        const service = await getService();
        // Only the live link changes; unsaved editor fields stay as typed.
        const updated = await service.patch(newsletter.id, { externalUrl });
        await writeNewsletter(updated);
        notificationsService.success(
          externalUrl ? 'Live link saved' : 'Live link removed',
        );
      } catch (error) {
        logger.error('Failed to save newsletter live link', error);
        notificationsService.error('Failed to save the live link');
      } finally {
        setIsSavingExternalUrl(false);
      }
    },
    [getService, newsletter, notificationsService, writeNewsletter],
  );

  const handleArchive = useCallback(
    async (id: string) => {
      if (!newsletter || !beginAction('archiving')) {
        return;
      }

      try {
        const service = await getService();
        applyNewsletter(await service.archive(id));
        notificationsService.success('Newsletter archived');
      } catch (error) {
        logger.error('Failed to archive newsletter', error);
        notificationsService.error('Failed to archive newsletter');
      } finally {
        finishAction();
      }
    },
    [
      applyNewsletter,
      beginAction,
      finishAction,
      getService,
      newsletter,
      notificationsService,
    ],
  );

  return {
    contextPreview,
    isEditorDirty: isEditorDirty(editorState, newsletter),
    editorState,
    handleApprove,
    handleArchive,
    handleDelivered,
    handleEditorChange,
    handlePublish,
    handleRegenerate,
    handleSave,
    handleSaveExternalUrl,
    isLoading,
    isSavingExternalUrl,
    loadingAction,
    newsletter,
  };
}

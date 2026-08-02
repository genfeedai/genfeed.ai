'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Newsletter } from '@models/content/newsletter.model';
import type {
  NewsletterContextPreview,
  NewsletterEditorLoadingAction,
  NewsletterEditorState,
} from '@props/content/artifact-editor.props';
import { NewslettersService } from '@services/content/newsletters.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useCallback, useEffect, useState } from 'react';
import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';

/** Newsletters publish to the email/newsletter channel rather than a social platform. */
const NEWSLETTER_PUBLISH_PLATFORM = 'newsletter';

export interface UseNewsletterEditorReturn {
  contextPreview: NewsletterContextPreview | null;
  editorDirty: boolean;
  editorState: NewsletterEditorState;
  isLoading: boolean;
  loadingAction: NewsletterEditorLoadingAction;
  newsletter: Newsletter | null;
  handleApprove: (id: string) => Promise<void>;
  handleArchive: (id: string) => Promise<void>;
  handleEditorChange: (patch: Partial<NewsletterEditorState>) => void;
  handlePublish: (id: string) => Promise<void>;
  handleRegenerate: () => Promise<void>;
  handleSave: () => Promise<void>;
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
 */
export function useNewsletterEditor(
  newsletterId: string,
): UseNewsletterEditorReturn {
  const notificationsService = NotificationsService.getInstance();
  const [newsletter, setNewsletter] = useState<Newsletter | null>(null);
  const [contextPreview, setContextPreview] =
    useState<NewsletterContextPreview | null>(null);
  const [editorState, setEditorState] = useState<NewsletterEditorState>(() =>
    createEditorState(null),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadingAction, setLoadingAction] =
    useState<NewsletterEditorLoadingAction>(null);

  const getService = useAuthedService(
    useCallback((token: string) => NewslettersService.getInstance(token), []),
  );

  const applyNewsletter = useCallback((next: Newsletter) => {
    setNewsletter(next);
    setEditorState(createEditorState(next));
  }, []);

  const loadContext = useCallback(
    async (id: string) => {
      try {
        const service = await getService();
        setContextPreview(await service.getContext(id));
      } catch (error) {
        logger.error('Failed to load newsletter context', error);
      }
    },
    [getService],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadNewsletter() {
      setIsLoading(true);

      try {
        const service = await getService();
        const data = await service.findOne(newsletterId, {}, controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        applyNewsletter(data);
        const context = await service.getContext(newsletterId);

        if (controller.signal.aborted) {
          return;
        }

        setContextPreview(context);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        logger.error('Failed to load newsletter', error);
        notificationsService.error('Failed to load newsletter');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadNewsletter();

    return () => controller.abort();
  }, [applyNewsletter, getService, newsletterId, notificationsService]);

  const handleEditorChange = useCallback(
    (patch: Partial<NewsletterEditorState>) => {
      setEditorState((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!newsletter) {
      return;
    }

    setLoadingAction('saving');

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
      setLoadingAction(null);
    }
  }, [
    applyNewsletter,
    editorState,
    getService,
    newsletter,
    notificationsService,
  ]);

  const handleRegenerate = useCallback(async () => {
    if (!newsletter) {
      return;
    }

    if (!editorState.topic.trim()) {
      notificationsService.error('Newsletter topic is required');
      return;
    }

    setLoadingAction('generatingDraft');

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
      setLoadingAction(null);
    }
  }, [
    applyNewsletter,
    contextPreview,
    editorState,
    getService,
    loadContext,
    newsletter,
    notificationsService,
  ]);

  const handleApprove = useCallback(
    async (id: string) => {
      setLoadingAction('approving');

      try {
        const service = await getService();
        applyNewsletter(await service.approve(id));
        await loadContext(id);
        notificationsService.success('Newsletter approved');
      } catch (error) {
        logger.error('Failed to approve newsletter', error);
        notificationsService.error('Failed to approve newsletter');
      } finally {
        setLoadingAction(null);
      }
    },
    [applyNewsletter, getService, loadContext, notificationsService],
  );

  const handlePublish = useCallback(
    async (id: string) => {
      setLoadingAction('publishing');

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
        setLoadingAction(null);
      }
    },
    [applyNewsletter, getService, loadContext, notificationsService],
  );

  const handleArchive = useCallback(
    async (id: string) => {
      setLoadingAction('archiving');

      try {
        const service = await getService();
        applyNewsletter(await service.archive(id));
        notificationsService.success('Newsletter archived');
      } catch (error) {
        logger.error('Failed to archive newsletter', error);
        notificationsService.error('Failed to archive newsletter');
      } finally {
        setLoadingAction(null);
      }
    },
    [applyNewsletter, getService, notificationsService],
  );

  return {
    contextPreview,
    editorDirty: isEditorDirty(editorState, newsletter),
    editorState,
    handleApprove,
    handleArchive,
    handleEditorChange,
    handlePublish,
    handleRegenerate,
    handleSave,
    isLoading,
    loadingAction,
    newsletter,
  };
}

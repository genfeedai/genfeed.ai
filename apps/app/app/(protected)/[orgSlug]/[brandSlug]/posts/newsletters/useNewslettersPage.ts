import { useBrand } from '@contexts/user/brand-context/brand-context';
import { GenerationType } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Newsletter } from '@models/content/newsletter.model';
import { NewslettersService } from '@services/content/newsletters.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';

/** Newsletters publish to the email/newsletter channel rather than a social platform. */
const NEWSLETTER_PUBLISH_PLATFORM = 'newsletter';

type TopicProposal = {
  angle: string;
  reason: string;
  title: string;
};

export type NewsletterContextPreview = Awaited<
  ReturnType<NewslettersService['getContext']>
>;

type NewsletterEditorState = {
  angle: string;
  content: string;
  label: string;
  summary: string;
  topic: string;
};

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

export function useNewslettersPage() {
  const { push } = useRouter();
  const { href } = useOrgUrl();
  const searchParams = useSearchParams();
  const requestedNewsletterId = searchParams.get('id');
  const notificationsService = NotificationsService.getInstance();
  const { brandId, isReady, organizationId, selectedBrand } = useBrand();
  const [instructions, setInstructions] = useState('');
  const [manualTopic, setManualTopic] = useState('');
  const [manualAngle, setManualAngle] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | Newsletter['status']
  >('all');
  const [selectedNewsletterId, setSelectedNewsletterId] = useState('');
  const [selectedProposal, setSelectedProposal] =
    useState<TopicProposal | null>(null);
  const [proposals, setProposals] = useState<TopicProposal[]>([]);
  const [editorState, setEditorState] = useState<NewsletterEditorState>(() =>
    createEditorState(null),
  );
  const [isGeneratingTopics, setIsGeneratingTopics] = useState(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [contextPreview, setContextPreview] =
    useState<NewsletterContextPreview | null>(null);

  const getService = useAuthedService((token: string) =>
    NewslettersService.getInstance(token),
  );

  const {
    data: newsletters = [],
    isLoading,
    error: newslettersError,
    refetch,
  } = useQuery<Newsletter[]>({
    queryKey: ['newsletters', brandId, organizationId],
    queryFn: async () => {
      if (!isReady || !brandId || !organizationId) {
        return [];
      }

      const service = await getService();
      return await service.findAll({
        brand: brandId,
        organization: organizationId,
        pagination: false,
        sort: 'publishedAt: -1, createdAt: -1',
      });
    },
    enabled: isReady,
  });

  useEffect(() => {
    if (newslettersError) {
      logger.error('Failed to load newsletters', newslettersError);
      notificationsService.error('Failed to load newsletters');
    }
  }, [newslettersError, notificationsService]);

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const publishedNewsletters = useMemo(
    () => newsletters.filter((item) => item.status === 'published').slice(0, 5),
    [newsletters],
  );

  const filteredNewsletters = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return newsletters.filter((newsletter) => {
      if (statusFilter !== 'all' && newsletter.status !== statusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        newsletter.label,
        newsletter.topic,
        newsletter.summary,
        newsletter.content,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedSearch));
    });
  }, [newsletters, search, statusFilter]);

  const selectedNewsletter = useMemo(
    () => newsletters.find((item) => item.id === selectedNewsletterId) ?? null,
    [newsletters, selectedNewsletterId],
  );

  useEffect(() => {
    if (!requestedNewsletterId || selectedNewsletterId) {
      return;
    }

    if (newsletters.some((item) => item.id === requestedNewsletterId)) {
      setSelectedNewsletterId(requestedNewsletterId);
    }
  }, [newsletters, requestedNewsletterId, selectedNewsletterId]);

  const selectedContextSet = useMemo(
    () => new Set(selectedContextIds),
    [selectedContextIds],
  );

  const editorDirty = useMemo(
    () => isEditorDirty(editorState, selectedNewsletter),
    [editorState, selectedNewsletter],
  );

  useEffect(() => {
    if (selectedNewsletter) {
      setEditorState(createEditorState(selectedNewsletter));
    } else {
      setEditorState(createEditorState(null));
    }
  }, [selectedNewsletter]);

  useEffect(() => {
    if (selectedContextIds.length === 0 && publishedNewsletters.length > 0) {
      setSelectedContextIds(publishedNewsletters.map((item) => item.id));
    }
  }, [publishedNewsletters, selectedContextIds.length]);

  async function loadContext(newsletterId: string) {
    try {
      const service = await getService();
      const context = await service.getContext(newsletterId);
      setContextPreview(context);
      setSelectedContextIds(
        context.selectedContextIds.length > 0
          ? context.selectedContextIds
          : publishedNewsletters.map((item) => item.id),
      );
    } catch (error) {
      logger.error('Failed to load newsletter context', error);
      notificationsService.error('Failed to load newsletter context');
    }
  }

  async function handleGenerateTopics() {
    setIsGeneratingTopics(true);

    try {
      const service = await getService();
      const data = await service.generateTopicProposals({
        count: 5,
        instructions: instructions || undefined,
      });
      setProposals(data);
      setSelectedProposal(data[0] ?? null);
      notificationsService.success('Generated topic proposals');
    } catch (error) {
      logger.error('Failed to generate newsletter topics', error);
      notificationsService.error('Failed to generate topic proposals');
    } finally {
      setIsGeneratingTopics(false);
    }
  }

  async function handleGenerateDraft() {
    const topic = selectedProposal?.title || manualTopic.trim();
    const angle = selectedProposal?.angle || manualAngle.trim() || undefined;

    if (!topic) {
      notificationsService.error('Select a proposal or enter a manual topic');
      return;
    }

    setIsGeneratingDraft(true);
    captureAnalyticsEvent(ANALYTICS_EVENTS.GENERATION_STARTED, {
      generationType: GenerationType.NEWSLETTER,
    });

    try {
      const service = await getService();
      const draft = await service.generateDraft({
        angle,
        contextNewsletterIds:
          selectedContextIds.length > 0 ? selectedContextIds : undefined,
        instructions: instructions || undefined,
        topic,
      });

      await refresh();
      setSelectedNewsletterId(draft.id);
      await loadContext(draft.id);
      captureAnalyticsEvent(ANALYTICS_EVENTS.GENERATION_COMPLETED, {
        generationType: GenerationType.NEWSLETTER,
        outcome: 'success',
      });
      notificationsService.success('Newsletter draft ready for review');
    } catch (error) {
      captureAnalyticsEvent(ANALYTICS_EVENTS.GENERATION_COMPLETED, {
        generationType: GenerationType.NEWSLETTER,
        outcome: 'failure',
      });
      logger.error('Failed to generate newsletter draft', error);
      notificationsService.error('Failed to generate draft');
    } finally {
      setIsGeneratingDraft(false);
    }
  }

  async function handleSave() {
    if (!selectedNewsletter) {
      return;
    }

    setIsSaving(true);

    try {
      const service = await getService();
      const updated = await service.patch(selectedNewsletter.id, {
        angle: editorState.angle || undefined,
        content: editorState.content,
        label: editorState.label.trim(),
        summary: editorState.summary || undefined,
        topic: editorState.topic.trim(),
      });

      await refresh();
      setSelectedNewsletterId(updated.id);
      notificationsService.success('Newsletter saved');
    } catch (error) {
      logger.error('Failed to save newsletter', error);
      notificationsService.error('Failed to save newsletter');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRegenerate() {
    if (!selectedNewsletter) {
      return;
    }

    if (!editorState.topic.trim()) {
      notificationsService.error('Newsletter topic is required');
      return;
    }

    setIsGeneratingDraft(true);

    try {
      const service = await getService();
      const regenerated = await service.generateDraft({
        angle: editorState.angle || undefined,
        contextNewsletterIds:
          selectedContextIds.length > 0 ? selectedContextIds : undefined,
        instructions: instructions || undefined,
        newsletterId: selectedNewsletter.id,
        topic: editorState.topic.trim(),
      });

      await refresh();
      setSelectedNewsletterId(regenerated.id);
      await loadContext(regenerated.id);
      notificationsService.success('Newsletter regenerated');
    } catch (error) {
      logger.error('Failed to regenerate newsletter', error);
      notificationsService.error('Failed to regenerate newsletter');
    } finally {
      setIsGeneratingDraft(false);
    }
  }

  async function handleApprove(id: string) {
    setIsApproving(true);

    try {
      const service = await getService();
      await service.approve(id);
      await refresh();
      await loadContext(id);
      notificationsService.success('Newsletter approved');
    } catch (error) {
      logger.error('Failed to approve newsletter', error);
      notificationsService.error('Failed to approve newsletter');
    } finally {
      setIsApproving(false);
    }
  }

  async function handlePublish(id: string) {
    setIsPublishing(true);

    try {
      const service = await getService();
      await service.publish(id);
      captureAnalyticsEvent(ANALYTICS_EVENTS.POST_PUBLISHED, {
        platform: NEWSLETTER_PUBLISH_PLATFORM,
      });
      captureAnalyticsEvent(ANALYTICS_EVENTS.FIRST_SUCCESSFUL_PUBLISH, {
        platform: NEWSLETTER_PUBLISH_PLATFORM,
        surface: 'newsletter',
      });
      await refresh();
      await loadContext(id);
      notificationsService.success('Newsletter published');
    } catch (error) {
      logger.error('Failed to publish newsletter', error);
      notificationsService.error('Failed to publish newsletter');
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleArchive(id: string) {
    setIsArchiving(true);

    try {
      const service = await getService();
      await service.archive(id);
      await refresh();

      if (selectedNewsletterId === id) {
        await loadContext(id);
      }

      notificationsService.success('Newsletter archived');
    } catch (error) {
      logger.error('Failed to archive newsletter', error);
      notificationsService.error('Failed to archive newsletter');
    } finally {
      setIsArchiving(false);
    }
  }

  return {
    contextPreview,
    editorDirty,
    editorState,
    filteredNewsletters,
    href,
    instructions,
    isApproving,
    isArchiving,
    isGeneratingDraft,
    isGeneratingTopics,
    isLoading,
    isPublishing,
    isSaving,
    manualAngle,
    manualTopic,
    proposals,
    publishedNewsletters,
    push,
    search,
    selectedBrand,
    selectedContextSet,
    selectedNewsletter,
    selectedNewsletterId,
    selectedProposal,
    setSelectedProposal,
    setInstructions,
    setManualAngle,
    setManualTopic,
    setSearch,
    setSelectedContextIds,
    setStatusFilter,
    statusFilter,
    handleApprove,
    handleArchive,
    handleGenerateDraft,
    handleGenerateTopics,
    handlePublish,
    handleRegenerate,
    handleSave,
    loadContext,
    setEditorState,
    setSelectedNewsletterId,
  };
}

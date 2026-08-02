import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  APP_ROUTES,
  createArtifactEditorRoute,
  withArtifactEditorReturn,
} from '@genfeedai/constants';
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

type TopicProposal = {
  angle: string;
  reason: string;
  title: string;
};

export function useNewslettersPage() {
  const { push, replace } = useRouter();
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
  const [selectedProposal, setSelectedProposal] =
    useState<TopicProposal | null>(null);
  const [proposals, setProposals] = useState<TopicProposal[]>([]);
  const [isGeneratingTopics, setIsGeneratingTopics] = useState(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);

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

  const selectedContextSet = useMemo(
    () => new Set(selectedContextIds),
    [selectedContextIds],
  );

  useEffect(() => {
    if (selectedContextIds.length === 0 && publishedNewsletters.length > 0) {
      setSelectedContextIds(publishedNewsletters.map((item) => item.id));
    }
  }, [publishedNewsletters, selectedContextIds.length]);

  const getNewsletterEditorHref = useCallback(
    (newsletterId: string) =>
      withArtifactEditorReturn(
        href(createArtifactEditorRoute('newsletter', newsletterId)),
        href(APP_ROUTES.PUBLISH.NEWSLETTERS),
      ),
    [href],
  );

  /** Refinement lives on the artifact, so the list only opens the editor. */
  const openNewsletterEditor = useCallback(
    (newsletterId: string) => push(getNewsletterEditorHref(newsletterId)),
    [getNewsletterEditorHref, push],
  );

  // Legacy `?id=` deep links selected a newsletter inline; send them to its page.
  useEffect(() => {
    if (requestedNewsletterId) {
      replace(getNewsletterEditorHref(requestedNewsletterId));
    }
  }, [getNewsletterEditorHref, replace, requestedNewsletterId]);

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
      captureAnalyticsEvent(ANALYTICS_EVENTS.GENERATION_COMPLETED, {
        generationType: GenerationType.NEWSLETTER,
        outcome: 'success',
      });
      notificationsService.success('Newsletter draft ready for review');
      openNewsletterEditor(draft.id);
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

  return {
    filteredNewsletters,
    getNewsletterEditorHref,
    href,
    instructions,
    isGeneratingDraft,
    isGeneratingTopics,
    isLoading,
    manualAngle,
    manualTopic,
    openNewsletterEditor,
    proposals,
    publishedNewsletters,
    push,
    search,
    selectedBrand,
    selectedContextSet,
    selectedProposal,
    setSelectedProposal,
    setInstructions,
    setManualAngle,
    setManualTopic,
    setSearch,
    setSelectedContextIds,
    setStatusFilter,
    statusFilter,
    handleGenerateDraft,
    handleGenerateTopics,
  };
}

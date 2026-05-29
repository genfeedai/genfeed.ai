'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Newsletter } from '@models/content/newsletter.model';
import { NewslettersService } from '@services/content/newsletters.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { HiEnvelope, HiMagnifyingGlass } from 'react-icons/hi2';
import NewsletterContextReview from './newsletters-context-review';
import NewsletterEditor from './newsletters-editor';
import NewsletterGeneratePanel from './newsletters-generate-panel';

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

const STATUS_FILTERS: Array<{
  label: string;
  value: 'all' | Newsletter['status'];
}> = [
  { label: 'All', value: 'all' },
  { label: 'Review', value: 'ready_for_review' },
  { label: 'Approved', value: 'approved' },
  { label: 'Published', value: 'published' },
  { label: 'Archived', value: 'archived' },
];

function statusLabel(status: Newsletter['status']): string {
  switch (status) {
    case 'ready_for_review':
      return 'Ready For Review';
    default:
      return status.replace(/_/g, ' ');
  }
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

function NewslettersPageContent() {
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
      notificationsService.success('Newsletter draft ready for review');
    } catch (error) {
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

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-foreground">Newsletters</h1>
        <p className="text-sm text-muted-foreground">
          Build history-aware newsletters for{' '}
          {selectedBrand?.label ?? 'your brand'} with topic proposals,
          continuity memory, and an editable review workflow.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <NewsletterGeneratePanel
          instructions={instructions}
          isGeneratingDraft={isGeneratingDraft}
          isGeneratingTopics={isGeneratingTopics}
          manualAngle={manualAngle}
          manualTopic={manualTopic}
          proposals={proposals}
          publishedNewsletters={publishedNewsletters}
          selectedContextSet={selectedContextSet}
          selectedProposal={selectedProposal}
          onGenerateDraft={handleGenerateDraft}
          onGenerateTopics={handleGenerateTopics}
          onInstructionsChange={setInstructions}
          onManualAngleChange={setManualAngle}
          onManualTopicChange={setManualTopic}
          onSelectProposal={setSelectedProposal}
          onToggleContext={(id, checked) => {
            setSelectedContextIds((prev) =>
              checked ? [...prev, id] : prev.filter((item) => item !== id),
            );
          }}
        />

        <NewsletterContextReview contextPreview={contextPreview} />
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Newsletter archive</h2>
            <p className="text-sm text-muted-foreground">
              Review-ready issues stay separate from articles and social posts.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative">
              <HiMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search newsletters"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((filter) => (
                <Button
                  key={filter.value}
                  label={filter.label}
                  variant={
                    statusFilter === filter.value
                      ? ButtonVariant.SOFT
                      : ButtonVariant.UNSTYLED
                  }
                  className={
                    statusFilter === filter.value
                      ? ''
                      : 'rounded-lg border border-border px-3 py-2 text-sm'
                  }
                  onClick={() => setStatusFilter(filter.value)}
                />
              ))}
            </div>
          </div>
        </div>

        {filteredNewsletters.length === 0 && !isLoading ? (
          <CardEmpty
            icon={HiEnvelope}
            label="No newsletters found"
            description="Create or schedule newsletter workflows from Workflows, then review generated issues here."
            action={{
              label: 'Open Workflows',
              onClick: () => push(href('/workflows')),
              variant: ButtonVariant.SOFT,
            }}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {isLoading
                    ? 'Loading archive…'
                    : `${filteredNewsletters.length} issues`}
                </div>
                <Badge status={isLoading ? 'processing' : 'active'}>
                  {isLoading ? 'Loading' : 'Loaded'}
                </Badge>
              </div>

              {filteredNewsletters.map((newsletter) => (
                <Button
                  key={newsletter.id}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  className={`w-full rounded-lg border p-4 text-left transition-colors ${
                    newsletter.id === selectedNewsletterId
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  }`}
                  onClick={async () => {
                    setSelectedNewsletterId(newsletter.id);
                    await loadContext(newsletter.id);
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-foreground">
                      {newsletter.label}
                    </div>
                    <Badge status={newsletter.status}>
                      {statusLabel(newsletter.status)}
                    </Badge>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {newsletter.topic}
                  </div>
                  {newsletter.summary ? (
                    <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {newsletter.summary}
                    </div>
                  ) : null}
                </Button>
              ))}
            </div>

            {selectedNewsletter ? (
              <NewsletterEditor
                editorDirty={editorDirty}
                editorState={editorState}
                isApproving={isApproving}
                isArchiving={isArchiving}
                isGeneratingDraft={isGeneratingDraft}
                isPublishing={isPublishing}
                isSaving={isSaving}
                selectedNewsletter={selectedNewsletter}
                onApprove={handleApprove}
                onArchive={handleArchive}
                onEditorChange={(patch) =>
                  setEditorState((prev) => ({ ...prev, ...patch }))
                }
                onPublish={handlePublish}
                onRegenerate={handleRegenerate}
                onSave={handleSave}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                Select a newsletter to edit content, revise context, and move it
                through review and publish states.
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function NewslettersPage() {
  return (
    <Suspense fallback={null}>
      <NewslettersPageContent />
    </Suspense>
  );
}

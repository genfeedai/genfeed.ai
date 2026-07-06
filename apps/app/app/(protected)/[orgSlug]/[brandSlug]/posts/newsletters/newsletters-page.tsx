'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { Newsletter } from '@models/content/newsletter.model';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Suspense } from 'react';
import { HiEnvelope, HiMagnifyingGlass } from 'react-icons/hi2';
import NewsletterContextReview from './newsletters-context-review';
import NewsletterEditor from './newsletters-editor';
import NewsletterGeneratePanel from './newsletters-generate-panel';
import { useNewslettersPage } from './useNewslettersPage';

export type { NewsletterContextPreview } from './useNewslettersPage';

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

function NewslettersPageContent() {
  const {
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
  } = useNewslettersPage();

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
                  className={`w-full rounded-lg p-4 text-left transition-colors ${
                    newsletter.id === selectedNewsletterId
                      ? 'shadow-border-strong bg-tertiary'
                      : 'bg-tertiary/50 hover:bg-tertiary'
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
                loadingAction={
                  isApproving
                    ? 'approving'
                    : isArchiving
                      ? 'archiving'
                      : isGeneratingDraft
                        ? 'generatingDraft'
                        : isPublishing
                          ? 'publishing'
                          : isSaving
                            ? 'saving'
                            : null
                }
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

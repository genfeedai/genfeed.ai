'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { formatNewsletterStatusLabel } from '@helpers/content/newsletters.helper';
import type { Newsletter } from '@models/content/newsletter.model';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Mail, Search } from 'lucide-react';
import { Suspense } from 'react';

import NewsletterGeneratePanel from './newsletters-generate-panel';
import { useNewslettersPage } from './useNewslettersPage';

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

function NewslettersPageContent() {
  const {
    filteredNewsletters,
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
  } = useNewslettersPage();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <h1 className="sr-only">Newsletters</h1>

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

      <Card className="p-5">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-semibold text-lg">Newsletter archive</h2>
            <p className="text-muted-foreground text-sm">
              Review-ready issues stay separate from articles and social posts.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
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
                      ? ButtonVariant.SECONDARY
                      : ButtonVariant.GHOST
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
            icon={Mail}
            label="No newsletters found"
            description="Create or schedule newsletter workflows from Workflows, then review generated issues here."
            action={{
              label: 'Open Workflows',
              onClick: () => push(href(APP_ROUTES.AUTOMATE.WORKFLOWS)),
              variant: ButtonVariant.SECONDARY,
            }}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-muted-foreground text-sm">
                {isLoading
                  ? 'Loading archive…'
                  : `${filteredNewsletters.length} issues`}
              </div>
              <Badge status={isLoading ? 'processing' : 'active'}>
                {isLoading ? 'Loading' : 'Loaded'}
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredNewsletters.map((newsletter) => (
                <Button
                  key={newsletter.id}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  className="w-full rounded-lg bg-tertiary/50 p-4 text-left transition-colors hover:bg-tertiary"
                  onClick={() => openNewsletterEditor(newsletter.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-foreground">
                      {newsletter.label}
                    </div>
                    <Badge status={newsletter.status}>
                      {formatNewsletterStatusLabel(newsletter.status)}
                    </Badge>
                  </div>
                  <div className="mt-2 text-muted-foreground text-sm">
                    {newsletter.topic}
                  </div>
                  {newsletter.summary ? (
                    <div className="mt-2 line-clamp-2 text-muted-foreground text-xs">
                      {newsletter.summary}
                    </div>
                  ) : null}
                </Button>
              ))}
            </div>
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

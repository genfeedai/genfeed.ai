'use client';

import type { EdgeStyle } from '@genfeedai/types';
import { ArrowLeft, ArrowRight, ExternalLink, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WorkflowPreview } from '@/components/WorkflowPreview';
import { type TemplateData, templatesApi } from '@/lib/api/templates';
import {
  type Difficulty,
  extractProviders,
  getDifficulty,
  getDifficultyColor,
  getProviderColor,
  type ProviderName,
} from '@/lib/template-utils';
import { useUIStore } from '@genfeedai/workflow-ui/stores';
import { useWorkflowStore } from '@/store/workflowStore';

type CategoryFilter = 'all' | 'simple' | 'advanced' | 'community';

const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'Simple', value: 'simple' },
  { label: 'Advanced', value: 'advanced' },
  { label: 'Community', value: 'community' },
];

interface TemplateWithMeta extends TemplateData {
  difficulty: Difficulty;
  providers: ProviderName[];
}

function TemplateCard({
  template,
  onSelect,
  isLoading,
}: {
  template: TemplateWithMeta;
  onSelect: (template: TemplateData) => void;
  isLoading: boolean;
}) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-all hover:border-primary/50 hover:shadow-lg">
      {/* Thumbnail */}
      <div className="relative aspect-video w-full bg-secondary">
        {template.thumbnail ? (
          <img
            src={template.thumbnail}
            alt={template.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <WorkflowPreview nodes={template.nodes} edges={template.edges} />
        )}
        {/* Difficulty badge */}
        <span
          className={`absolute left-2 top-2 rounded px-2 py-0.5 text-xs font-medium ${getDifficultyColor(template.difficulty)}`}
        >
          {template.difficulty === 'simple' ? 'Simple' : 'Advanced'}
        </span>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col p-3">
        <h3 className="font-medium text-foreground">{template.name}</h3>
        {template.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.description}</p>
        )}

        {/* Provider chips */}
        {template.providers.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {template.providers.slice(0, 3).map((provider) => (
              <span
                key={provider}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${getProviderColor(provider)}`}
              >
                {provider}
              </span>
            ))}
            {template.providers.length > 3 && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                +{template.providers.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Stats row */}
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{template.nodes.length} nodes</span>
          <span>•</span>
          <span>{template.edges.length} connections</span>
        </div>

        {/* Use workflow button */}
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 w-full justify-between text-primary hover:bg-primary/10 hover:text-primary"
          onClick={() => onSelect(template)}
          disabled={isLoading}
        >
          Use workflow
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function TemplateSection({
  title,
  templates,
  onSelect,
  isLoading,
}: {
  title: string;
  templates: TemplateWithMeta[];
  onSelect: (template: TemplateData) => void;
  isLoading: boolean;
}) {
  if (templates.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <TemplateCard
            key={template._id}
            template={template}
            onSelect={onSelect}
            isLoading={isLoading}
          />
        ))}
      </div>
    </div>
  );
}

function TemplatesModalComponent() {
  const router = useRouter();
  const { activeModal, closeModal } = useUIStore();
  const { loadWorkflow, saveWorkflow } = useWorkflowStore();

  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [selectedProviders, setSelectedProviders] = useState<Set<ProviderName>>(new Set());

  const isOpen = activeModal === 'templates';

  // Fetch templates
  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();

    async function fetchTemplates() {
      setIsLoading(true);
      setError(null);

      try {
        const data = await templatesApi.getAll(controller.signal);
        setTemplates(data);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError('Failed to load templates');
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchTemplates();
    return () => controller.abort();
  }, [isOpen]);

  // Enrich templates with computed metadata
  const enrichedTemplates = useMemo((): TemplateWithMeta[] => {
    return templates.map((template) => ({
      ...template,
      difficulty: getDifficulty(template.nodes.length),
      providers: extractProviders(template.nodes),
    }));
  }, [templates]);

  // Get all available providers from templates
  const availableProviders = useMemo((): ProviderName[] => {
    const providers = new Set<ProviderName>();
    for (const template of enrichedTemplates) {
      for (const provider of template.providers) {
        providers.add(provider);
      }
    }
    return Array.from(providers).sort();
  }, [enrichedTemplates]);

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return enrichedTemplates.filter((template) => {
      // Search filter (client-side for instant feedback)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = template.name.toLowerCase().includes(query);
        const matchesDescription = template.description?.toLowerCase().includes(query);
        if (!matchesName && !matchesDescription) {
          return false;
        }
      }

      // Category filter
      if (categoryFilter === 'simple') {
        if (!template.isSystem || template.difficulty !== 'simple') return false;
      } else if (categoryFilter === 'advanced') {
        if (!template.isSystem || template.difficulty !== 'advanced') return false;
      } else if (categoryFilter === 'community') {
        if (template.isSystem) return false;
      }

      // Provider filter
      if (selectedProviders.size > 0) {
        const hasSelectedProvider = template.providers.some((p) => selectedProviders.has(p));
        if (!hasSelectedProvider) return false;
      }

      return true;
    });
  }, [enrichedTemplates, searchQuery, categoryFilter, selectedProviders]);

  // Split into system and community templates
  const systemTemplates = useMemo(
    () => filteredTemplates.filter((t) => t.isSystem),
    [filteredTemplates]
  );
  const communityTemplates = useMemo(
    () => filteredTemplates.filter((t) => !t.isSystem),
    [filteredTemplates]
  );

  const handleSelectTemplate = useCallback(
    async (template: TemplateData) => {
      setIsSaving(true);
      try {
        const now = new Date().toISOString();
        loadWorkflow({
          createdAt: now,
          description: template.description ?? '',
          edgeStyle: (template.edgeStyle === 'bezier'
            ? 'default'
            : (template.edgeStyle ?? 'default')) as EdgeStyle,
          edges: template.edges,
          groups: [],
          name: template.name,
          nodes: template.nodes,
          updatedAt: now,
          version: 1,
        });

        const savedWorkflow = await saveWorkflow();
        closeModal();
        router.push(`/workflows/${savedWorkflow._id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create workflow');
      } finally {
        setIsSaving(false);
      }
    },
    [loadWorkflow, saveWorkflow, closeModal, router]
  );

  const toggleProvider = useCallback((provider: ProviderName) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  }, []);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50" onClick={closeModal} />

      {/* Modal */}
      <div className="fixed inset-4 z-50 flex overflow-hidden rounded-lg bg-card shadow-xl md:inset-8 lg:inset-12">
        {/* Sidebar */}
        <div className="flex w-64 flex-shrink-0 flex-col border-r border-border bg-card">
          {/* Sidebar Header */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <button
              onClick={closeModal}
              className="flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>

          <div className="px-4 py-4">
            <h2 className="text-lg font-semibold">Template Explorer</h2>
          </div>

          {/* Search */}
          <div className="px-4 pb-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {/* Category Filters */}
          <div className="flex-1 overflow-auto px-4">
            <div className="mb-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Category
              </h3>
              <div className="space-y-1">
                {CATEGORY_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm transition hover:bg-secondary"
                  >
                    <input
                      type="radio"
                      name="category"
                      value={option.value}
                      checked={categoryFilter === option.value}
                      onChange={() => setCategoryFilter(option.value)}
                      className="h-4 w-4 border-border text-primary focus:ring-primary"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Provider Filters */}
            {availableProviders.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Provider
                </h3>
                <div className="space-y-1">
                  {availableProviders.map((provider) => (
                    <label
                      key={provider}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm transition hover:bg-secondary"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProviders.has(provider)}
                        onChange={() => toggleProvider(provider)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      {provider}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Marketplace CTA */}
          <div className="border-t border-border p-4">
            <a
              href="https://marketplace.genfeed.ai/workflows"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm font-medium transition hover:bg-secondary/80"
            >
              <ExternalLink className="h-4 w-4" />
              Browse Marketplace
            </a>
          </div>
        </div>

        {/* Content Area */}
        <div className="relative flex-1 overflow-auto p-6">
          {isSaving && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">Creating workflow...</p>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-destructive">
              <p>{error}</p>
              <Button variant="secondary" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              No templates found
            </div>
          ) : (
            <>
              {/* Show sections based on filter */}
              {categoryFilter === 'community' ? (
                <TemplateSection
                  title="Community Workflows"
                  templates={communityTemplates}
                  onSelect={handleSelectTemplate}
                  isLoading={isSaving}
                />
              ) : categoryFilter === 'all' ? (
                <>
                  <TemplateSection
                    title="Quick Start"
                    templates={systemTemplates}
                    onSelect={handleSelectTemplate}
                    isLoading={isSaving}
                  />
                  <TemplateSection
                    title="Community Workflows"
                    templates={communityTemplates}
                    onSelect={handleSelectTemplate}
                    isLoading={isSaving}
                  />
                </>
              ) : (
                <TemplateSection
                  title={categoryFilter === 'simple' ? 'Simple Workflows' : 'Advanced Workflows'}
                  templates={systemTemplates}
                  onSelect={handleSelectTemplate}
                  isLoading={isSaving}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export const TemplatesModal = memo(TemplatesModalComponent);

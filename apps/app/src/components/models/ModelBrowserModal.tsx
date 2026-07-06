'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type {
  ModelCapability,
  ProviderModel,
  ProviderType,
} from '@genfeedai/types';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { AlertTriangle, ExternalLink, Search, Sparkles, X } from 'lucide-react';
import { memo } from 'react';
import { createPortal } from 'react-dom';
import { ModelCard } from './ModelCard';
import { USE_CASE_CONFIG } from './model-browser-badges.constants';
import { useModelBrowserModal } from './useModelBrowserModal';

// =============================================================================
// TYPES
// =============================================================================

interface ModelBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (model: ProviderModel) => void;
  capabilities?: ModelCapability[];
  title?: string;
}

// =============================================================================
// MAIN MODAL
// =============================================================================

function ModelBrowserModalComponent({
  isOpen,
  onClose,
  onSelect,
  capabilities,
  title = 'Browse Models',
}: ModelBrowserModalProps) {
  const {
    searchQuery,
    setSearchQuery,
    providerFilter,
    setProviderFilter,
    useCaseFilter,
    setUseCaseFilter,
    models,
    configuredProviders,
    isLoading,
    hasFetched,
    filteredRecentModels,
    availableUseCases,
    handleSelect,
  } = useModelBrowserModal({ isOpen, onClose, onSelect, capabilities });

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        aria-label="Close model browser"
        className="fixed inset-0 z-50 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-xl bg-card shadow-xl md:inset-10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <Sparkles className="size-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          </div>
          <Button
            variant={ButtonVariant.GHOST}
            withWrapper={false}
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-secondary transition"
            icon={<X className="size-5" />}
          />
        </div>

        {/* Filters */}
        <div className="space-y-0 border-b border-border">
          <div className="flex items-center gap-4 px-6 py-4">
            {/* Search */}
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search models..."
                className="pl-10"
              />
            </div>

            {/* Provider filter - only show configured providers */}
            {configuredProviders.length > 0 && (
              <div className="flex items-center gap-2">
                {(
                  ['all', ...configuredProviders] as (ProviderType | 'all')[]
                ).map((provider) => (
                  <Button
                    key={provider}
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                    onClick={() => setProviderFilter(provider)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                      providerFilter === provider
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                    }`}
                  >
                    {provider === 'all'
                      ? 'All'
                      : provider === 'replicate'
                        ? 'Replicate'
                        : provider === 'fal'
                          ? 'fal.ai'
                          : 'Hugging Face'}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Use-case filter chips */}
          {availableUseCases.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto px-6 pb-4">
              <Button
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => setUseCaseFilter('all')}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  useCaseFilter === 'all'
                    ? 'bg-primary text-primary-foreground border border-transparent'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-transparent'
                }`}
                icon={<Sparkles className="size-3" />}
              >
                All
              </Button>
              {availableUseCases.map((uc) => {
                const config = USE_CASE_CONFIG[uc];
                const Icon = config.icon;
                return (
                  <Button
                    key={uc}
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                    onClick={() => setUseCaseFilter(uc)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      useCaseFilter === uc
                        ? 'bg-primary text-primary-foreground border border-transparent'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-transparent'
                    }`}
                    icon={<Icon className="size-3" />}
                  >
                    {config.label}
                  </Button>
                );
              })}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Warning when no providers configured */}
          {!isLoading && hasFetched && configuredProviders.length === 0 && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-warning/20 bg-warning/10 p-4">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
              <div>
                <p className="text-sm font-medium text-warning">
                  No AI providers configured
                </p>
                <p className="mt-1 text-xs text-warning/80">
                  Add API keys to your .env file to enable model selection.
                  Supported providers: REPLICATE_API_TOKEN, FAL_API_KEY,
                  HF_API_TOKEN
                </p>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Recent models */}
              {filteredRecentModels.length > 0 && !searchQuery && (
                <div>
                  <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                    Recently Used
                  </h3>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {filteredRecentModels.map((recent) => {
                      const model = models.find(
                        (m) =>
                          m.id === recent.id && m.provider === recent.provider,
                      );
                      if (!model) return null;
                      return (
                        <ModelCard
                          key={`${recent.provider}-${recent.id}`}
                          model={model}
                          onSelect={handleSelect}
                          isRecent
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* All models */}
              <div>
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                  {searchQuery ? `Results for "${searchQuery}"` : 'All Models'}
                </h3>
                {models.length === 0 ? (
                  <div className="flex h-40 flex-col items-center justify-center text-muted-foreground">
                    <Sparkles className="mb-2 size-8" />
                    <p className="text-sm">No models found</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {models.map((model) => (
                      <ModelCard
                        key={`${model.provider}-${model.id}`}
                        model={model}
                        onSelect={handleSelect}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          <p className="text-xs text-muted-foreground">
            {models.length} model{models.length !== 1 ? 's' : ''} available
          </p>
          <a
            href="https://replicate.com/explore"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Explore more on Replicate
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>
    </>,
    document.body,
  );
}

export const ModelBrowserModal = memo(ModelBrowserModalComponent);

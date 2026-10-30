'use client';

import {
  ButtonVariant,
  ComponentSize,
  QualityTier,
} from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type { ModelBrowserModalProps } from '@genfeedai/props/workflows/workflow-model-picker.props';
import { useSettingsStore } from '@genfeedai/workflows/ui/stores';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import Searchbar from '@ui/primitives/searchbar';
import Spinner from '@ui/primitives/spinner';
import { Clock, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useCallback, useMemo, useState } from 'react';

const RECENT_LIMIT = 4;

const TIER_VARIANT: Record<QualityTier, 'default' | 'secondary'> = {
  [QualityTier.BASIC]: 'secondary',
  [QualityTier.STANDARD]: 'secondary',
  [QualityTier.HIGH]: 'secondary',
  [QualityTier.ULTRA]: 'default',
};

function matchesQuery(model: IModel, query: string): boolean {
  if (!query) {
    return true;
  }
  const needle = query.toLowerCase();
  return [model.label, model.key, model.description ?? ''].some((field) =>
    field.toLowerCase().includes(needle),
  );
}

function ModelTile({
  isRecent = false,
  isSelected,
  model,
  onSelect,
}: {
  isRecent?: boolean;
  isSelected: boolean;
  model: IModel;
  onSelect: (model: IModel) => void;
}) {
  const translate = useTranslations('pages.workflows.modelPicker');

  return (
    <Button
      aria-pressed={isSelected}
      className="h-auto w-full justify-start rounded-xl bg-card p-3 text-left shadow-border"
      onClick={() => onSelect(model)}
      textTransform="none"
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    >
      <span className="flex w-full items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{model.label}</span>
          {model.description ? (
            <span className="truncate text-xs text-muted-foreground">
              {model.description}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {isRecent ? (
            <Clock className="size-3.5 text-muted-foreground" />
          ) : null}
          {model.qualityTier ? (
            <Badge variant={TIER_VARIANT[model.qualityTier]}>
              {translate(`tier.${model.qualityTier}`)}
            </Badge>
          ) : null}
        </span>
      </span>
    </Button>
  );
}

function ModelBrowserModalComponent({
  hasError,
  isLoading,
  isOpen,
  models,
  onClose,
  onSelect,
  selectedKey,
}: ModelBrowserModalProps) {
  const translate = useTranslations('pages.workflows.modelPicker');
  const recentModels = useSettingsStore((state) => state.recentModels);
  const addRecentModel = useSettingsStore((state) => state.addRecentModel);
  const [query, setQuery] = useState('');

  const visibleModels = useMemo(
    () => models.filter((model) => matchesQuery(model, query.trim())),
    [models, query],
  );
  const recent = useMemo(() => {
    if (query.trim()) {
      return [];
    }
    return recentModels
      .map((entry) => models.find((model) => model.key === entry.id))
      .filter((model): model is IModel => model !== undefined)
      .slice(0, RECENT_LIMIT);
  }, [models, query, recentModels]);

  const handleSelect = useCallback(
    (model: IModel) => {
      addRecentModel({
        displayName: model.label,
        id: model.key,
        provider: 'genfeed-ai',
      });
      onSelect(model);
      onClose();
    },
    [addRecentModel, onClose, onSelect],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setQuery('');
        onClose();
      }
    },
    [onClose],
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl" size="xl">
        <DialogHeader>
          <DialogTitle>{translate('title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {translate('description')}
          </DialogDescription>
        </DialogHeader>
        <Searchbar
          ariaLabel={translate('searchLabel')}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={translate('search')}
          size={ComponentSize.MD}
          value={query}
        />
        <DialogBody className="flex max-h-[24rem] flex-col gap-5">
          {isLoading ? (
            <div
              aria-label={translate('loading')}
              className="flex justify-center py-10"
              role="status"
            >
              <Spinner className="size-6 text-primary" />
            </div>
          ) : hasError ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {translate('error')}
            </p>
          ) : visibleModels.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {translate('empty')}
            </p>
          ) : (
            <>
              {recent.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    {translate('recent')}
                  </h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {recent.map((model) => (
                      <ModelTile
                        isRecent
                        isSelected={model.key === selectedKey}
                        key={model.key}
                        model={model}
                        onSelect={handleSelect}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  {translate('all')}
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {visibleModels.map((model) => (
                    <ModelTile
                      isSelected={model.key === selectedKey}
                      key={model.key}
                      model={model}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              </section>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export const ModelBrowserModal = memo(ModelBrowserModalComponent);

'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import type { WorkflowPromptPickerProps } from '@genfeedai/props/workflows/workflow-prompt-picker.props';
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
import { History } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { useWorkflowRecentPrompts } from '@/features/workflows/hooks/useWorkflowRecentPrompts';

export function WorkflowPromptPicker({ onSelect }: WorkflowPromptPickerProps) {
  const translate = useTranslations('pages.workflows.promptPicker');
  const translateInspector = useTranslations('pages.workflows.actionInspector');
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { hasError, isLoading, prompts } = useWorkflowRecentPrompts(isOpen);

  const visiblePrompts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? prompts.filter((prompt) => prompt.text.toLowerCase().includes(needle))
      : prompts;
  }, [prompts, query]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setIsOpen(nextOpen);
    if (!nextOpen) {
      setQuery('');
    }
  }, []);

  const handleSelect = useCallback(
    (text: string) => {
      onSelect(text);
      handleOpenChange(false);
    },
    [handleOpenChange, onSelect],
  );

  return (
    <>
      <Button
        className="nodrag ml-auto"
        onClick={() => setIsOpen(true)}
        size={ButtonSize.XS}
        type="button"
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      >
        <History className="size-3.5" />
        {translateInspector('promptFromRecent')}
      </Button>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl" size="lg">
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
          <DialogBody className="flex max-h-[24rem] flex-col gap-2">
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
            ) : visiblePrompts.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {translate('empty')}
              </p>
            ) : (
              visiblePrompts.map((prompt) => (
                <Button
                  className="h-auto w-full justify-start rounded-xl bg-card p-3 text-left shadow-border"
                  key={prompt.id}
                  onClick={() => handleSelect(prompt.text)}
                  textTransform="none"
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                >
                  <span className="line-clamp-3 text-sm">{prompt.text}</span>
                </Button>
              ))
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { PromptBarSuggestionItem } from '@genfeedai/props/prompt-bars/prompt-bar-suggestion-item.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { EditorProjectsService } from '@services/editor/editor-projects.service';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import PromptEmptyState from '@ui/layout/prompt-empty-state/PromptEmptyState';
import { Input } from '@ui/primitives/input';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import PromptBarSendButton from '@ui/prompt-bars/components/toolbar/PromptBarSendButton';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import { FolderOpen, SquarePlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useRef, useState } from 'react';

const MAX_NAME_LENGTH = 120;

/**
 * The left side of the Editor workspace while no project is open: a centered
 * prompt with two ways to start, and a name bar below. Creating saves an empty
 * project and opens its timeline. Videos from the Library arrive through
 * `/editor?video=<id>` and are seeded by `EditorVideoImport`.
 */
export default function EditorNewPane() {
  const t = useTranslations('pages.studioEditor');
  const { href } = useOrgUrl();
  const router = useRouter();
  const getEditorService = useAuthedService((token: string) =>
    EditorProjectsService.getInstance(token),
  );
  const [name, setName] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSubmitting = useRef(false);

  const suggestions: PromptBarSuggestionItem[] = [
    {
      description: t('startBlankDescription'),
      icon: <SquarePlus />,
      id: 'blank',
      label: t('startBlank'),
      prompt: '',
    },
    {
      description: t('startFromLibraryDescription'),
      icon: <FolderOpen />,
      id: 'library',
      label: t('startFromLibrary'),
      prompt: '',
    },
  ];

  async function create() {
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setIsBusy(true);
    setError(null);
    try {
      const service = await getEditorService();
      const project = await service.create({
        name: name.trim() || t('untitledProject'),
        sourceVideoIds: [],
      });
      router.push(href(`${APP_ROUTES.STUDIO.EDITOR}/${project.id}`));
    } catch (reason) {
      logger.error('Failed to create editor project', reason);
      setError(t('createFailed'));
    } finally {
      isSubmitting.current = false;
      setIsBusy(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void create();
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PromptEmptyState
        description={t('heroDescription')}
        title={t('heroTitle')}
      >
        <div className="@container w-full min-w-0">
          <PromptBarSuggestions
            className="grid grid-cols-1 @md:grid-cols-2 [&>button]:w-full [&>button]:max-w-none"
            isDisabled={isBusy}
            maxSuggestions={suggestions.length}
            onSuggestionSelect={(suggestion) => {
              if (suggestion.id === 'library') {
                router.push(href(APP_ROUTES.LIBRARY.ASSETS));
                return;
              }
              void create();
            }}
            suggestions={suggestions}
            variant="cards"
          />
        </div>
      </PromptEmptyState>
      <div className="mt-auto shrink-0 px-3 pb-3">
        <PromptBarContainer
          className="mx-auto w-full max-w-2xl"
          layoutMode="inflow"
          maxWidth="full"
          zIndex={60}
        >
          <PromptBarComposer
            banner={
              error ? (
                <p role="alert" className="p-3 text-sm text-destructive">
                  {error}
                </p>
              ) : undefined
            }
            density="compact"
          >
            <Input
              aria-label={t('projectName')}
              className="border-0 bg-transparent px-0 shadow-none"
              disabled={isBusy}
              maxLength={MAX_NAME_LENGTH}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('projectNamePlaceholder')}
              value={name}
            />
            <PromptBarToolbar
              trailing={
                <PromptBarSendButton
                  ariaLabel={t('createProject')}
                  isDisabled={isBusy}
                  isLoading={isBusy}
                  onClick={() => void create()}
                  tooltip={t('createProject')}
                />
              }
            />
          </PromptBarComposer>
        </PromptBarContainer>
      </div>
    </div>
  );
}

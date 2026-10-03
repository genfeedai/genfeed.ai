import { ContentLibraryPicker } from '@genfeedai/agent/components/ContentLibraryPicker';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ExtensionWorkspaceSnapshot } from '@genfeedai/contracts/interfaces';
import type { ChatInputProps } from '@genfeedai/props/extension/extension-library.props';
import PromptBarAttachedAssetsTray from '@ui/components/prompt-bars/components/attached-assets-tray/PromptBarAttachedAssetsTray';
import PromptBarComposer from '@ui/components/prompt-bars/components/shell/PromptBarComposer';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { ArrowUp, FolderOpen } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from 'react';
import { LibraryAttachmentActions } from '~components/chat/LibraryAttachmentActions';
import {
  type LibraryAsset,
  libraryArtifactReferences,
  loadLibraryAssets,
} from '~services/library.service';
import { useWorkspaceStore } from '~store/use-workspace-store';

export function ChatInput({
  onSend,
  disabled,
  suggestedPrompt,
}: ChatInputProps): ReactElement {
  const [value, setValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [items, setItems] = useState<LibraryAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [reload, setReload] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const workspaceState = useWorkspaceStore();
  const verified = useRef<ExtensionWorkspaceSnapshot | null>(null);
  const snapshot =
    workspaceState.status === 'ready' || workspaceState.status === 'refreshing'
      ? workspaceState.snapshot
      : verified.current;
  if (
    workspaceState.status === 'ready' ||
    workspaceState.status === 'refreshing'
  )
    verified.current = workspaceState.snapshot;
  const brandId = snapshot?.brandId;
  const scopeKey = snapshot
    ? `${snapshot.userId}:${snapshot.organizationId}:${snapshot.brandId}:${snapshot.revision}`
    : '';
  const isReady = workspaceState.status === 'ready' && Boolean(brandId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scopeRef = useRef(scopeKey);
  scopeRef.current = isReady ? scopeKey : '';
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isDebouncing, setIsDebouncing] = useState(false);
  const previousScope = useRef(scopeKey);
  const invalidates = () => {
    request.current?.abort();
    generation.current += 1;
  };
  useEffect(() => {
    if (suggestedPrompt) {
      setValue(suggestedPrompt);
      textareaRef.current?.focus();
    }
  }, [suggestedPrompt]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Actual scope resets clear all drafts and references; refreshing retains them.
  useEffect(() => {
    if (
      previousScope.current === scopeKey &&
      workspaceState.status !== 'loading'
    )
      return;
    previousScope.current = scopeKey;
    invalidates();
    setAssets([]);
    setValue('');
    setItems([]);
    setPage(1);
    setHasMore(false);
    setError(null);
    setIsOpen(false);
    setSearchQuery('');
    setDebouncedQuery('');
    setIsDebouncing(false);
  }, [scopeKey, workspaceState.status === 'loading']);
  useEffect(() => {
    if (!isDebouncing) return;
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
      setIsDebouncing(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, isDebouncing]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry repeats the captured page and query; generation rejects obsolete results.
  useEffect(() => {
    if (!isOpen || !isReady || !brandId || isDebouncing) {
      invalidates();
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    const currentGeneration = ++generation.current;
    const currentKey = scopeKey;
    const current = () =>
      !controller.signal.aborted &&
      generation.current === currentGeneration &&
      scopeRef.current === currentKey;
    setIsLoading(true);
    setError(null);
    loadLibraryAssets(brandId, {
      page,
      search: debouncedQuery,
      signal: controller.signal,
    })
      .then((result) => {
        if (!current()) return;
        setItems((previous) =>
          page === 1
            ? result.items
            : [
                ...new Map(
                  [...previous, ...result.items].map((item) => [item.id, item]),
                ).values(),
              ],
        );
        setHasMore(result.hasMore);
      })
      .catch(() => {
        if (current()) setError('Could not load Library. Retry.');
      })
      .finally(() => {
        if (current()) setIsLoading(false);
      });
    return () => controller.abort();
  }, [
    isOpen,
    isReady,
    brandId,
    scopeKey,
    page,
    reload,
    debouncedQuery,
    isDebouncing,
  ]);
  function closeLibrary(open: boolean) {
    invalidates();
    setIsOpen(open);
    setSearchQuery('');
    setDebouncedQuery('');
    setIsDebouncing(false);
    setPage(1);
    setItems([]);
    setHasMore(false);
    setError(null);
    setIsLoading(false);
  }
  function changeSearch(query: string) {
    invalidates();
    setSearchQuery(query);
    setIsDebouncing(true);
    setPage(1);
    setItems([]);
    setError(null);
    setHasMore(false);
    setIsLoading(false);
  }

  async function handleSend() {
    const content = value.trim();
    if (!content || disabled || isSending || !isReady || !brandId) return;
    const sentScope = scopeKey;
    setIsSending(true);
    try {
      const accepted = await onSend(
        content,
        libraryArtifactReferences(assets, brandId),
      );
      if (accepted && scopeRef.current === sentScope) {
        setValue('');
        setAssets([]);
      }
    } finally {
      setIsSending(false);
    }
  }
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void handleSend();
    }
  }
  function openLibrary() {
    if (isReady) closeLibrary(true);
  }
  const isDisabled = Boolean(disabled || isSending || !isReady);

  return (
    <div className="min-w-0">
      <PromptBarComposer
        density="compact"
        beforeBody={
          assets.length ? (
            <div className="px-3 pt-3">
              <PromptBarAttachedAssetsTray
                unoptimizedImages
                assets={assets.map((asset) => ({
                  id: asset.id,
                  name: asset.contentTitle,
                  kind: asset.kind,
                  previewUrl: asset.thumbnailUrl,
                  role: 'reference',
                  source: 'library',
                }))}
                density="compact"
                isDisabled={isDisabled}
                onBrowseAssets={openLibrary}
                onRemoveAttachedAsset={(id) =>
                  setAssets((current) =>
                    current.filter((asset) => asset.id !== id),
                  )
                }
              />
              <LibraryAttachmentActions
                assets={assets}
                isDisabled={isDisabled}
              />
            </div>
          ) : undefined
        }
      >
        <Textarea
          ref={textareaRef}
          aria-label="Conversation prompt"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            brandId
              ? 'What would you like to create?'
              : 'Select your brand to start creating'
          }
          disabled={isDisabled}
          rows={3}
          className="min-h-24 max-h-48 w-full resize-none border-0 bg-transparent px-1 py-2 text-sm leading-6 shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between gap-2 pt-1 pb-1">
          <Button
            variant={ButtonVariant.GHOST}
            withWrapper={false}
            icon={<FolderOpen className="size-4" />}
            onClick={openLibrary}
            isDisabled={!brandId || isDisabled}
            ariaLabel="Attach from Library"
            size={ButtonSize.SM}
          >
            Library
          </Button>
          <Button
            withWrapper={false}
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.ICON}
            className="rounded-full"
            icon={<ArrowUp className="size-4" />}
            onClick={() => void handleSend()}
            isDisabled={isDisabled || !brandId || !value.trim()}
            ariaLabel="Send message"
          />
        </div>
      </PromptBarComposer>
      <p className="mt-2 text-center text-2xs text-muted-foreground">
        {assets.length
          ? `${assets.length} Library ${assets.length === 1 ? 'reference' : 'references'} attached`
          : 'Create in your brand voice, wherever you browse'}
      </p>
      <ContentLibraryPicker
        title="Your Library"
        description="Attach generated or uploaded assets as references for this message."
        isOpen={isOpen}
        isLoading={(isLoading || isDebouncing) && page === 1}
        items={items}
        selectedIds={new Set(assets.map((asset) => asset.id))}
        searchMode="remote"
        searchQuery={searchQuery}
        onSearchQueryChange={changeSearch}
        onOpenChange={closeLibrary}
        onSelect={(item) => {
          const asset = items.find((candidate) => candidate.id === item.id);
          if (isReady && !isDebouncing && asset && asset.brandId === brandId) {
            setAssets((current) =>
              current.some((existing) => existing.id === asset.id)
                ? current
                : [...current, asset],
            );
            closeLibrary(false);
            textareaRef.current?.focus();
          }
        }}
        footer={
          error ? (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 text-xs text-destructive"
            >
              <span>{error}</span>
              <Button
                variant={ButtonVariant.SECONDARY}
                isDisabled={!isReady || isLoading}
                onClick={() => setReload((current) => current + 1)}
              >
                Retry
              </Button>
            </div>
          ) : hasMore ? (
            <Button
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
              className="w-full justify-center"
              isDisabled={isLoading || !isReady || isDebouncing}
              onClick={() => setPage((current) => current + 1)}
            >
              {isLoading ? 'Loading…' : 'Load more'}
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

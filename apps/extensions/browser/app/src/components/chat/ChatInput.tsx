import { ContentLibraryPicker } from '@genfeedai/agent/components/ContentLibraryPicker';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ExtensionWorkspaceSnapshot } from '@genfeedai/contracts/interfaces';
import type { ChatInputProps } from '@genfeedai/props/extension/extension-library.props';
import PromptBarAttachedAssetsTray from '@ui/components/prompt-bars/components/attached-assets-tray/PromptBarAttachedAssetsTray';
import PromptBarComposer from '@ui/components/prompt-bars/components/shell/PromptBarComposer';
import PromptBarSendButton from '@ui/components/prompt-bars/components/toolbar/PromptBarSendButton';
import PromptBarToolbar from '@ui/components/prompt-bars/components/toolbar/PromptBarToolbar';
import PromptEditorView from '@ui/components/prompt-editor/PromptEditorView';
import { Button } from '@ui/primitives/button';
import { FolderOpen } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { LibraryAttachmentActions } from '~components/chat/LibraryAttachmentActions';
import {
  type LibraryAsset,
  libraryArtifactReferences,
  loadLibraryAssets,
} from '~services/library.service';
import { useWorkspaceStore } from '~store/use-workspace-store';

export function ChatInput({
  initialAssets,
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
  // The editor applies a seed once per id, fills the draft and focuses itself.
  const suggestedSeed = useMemo(
    () =>
      suggestedPrompt
        ? {
            content: {
              content: [
                {
                  content: [{ text: suggestedPrompt, type: 'text' }],
                  type: 'paragraph',
                },
              ],
              type: 'doc',
            },
            id: suggestedPrompt,
          }
        : null,
    [suggestedPrompt],
  );
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
  // A reference handed over from a saved source joins the attached assets once,
  // and only for the brand it was prepared in.
  useEffect(() => {
    if (!initialAssets?.length || !brandId) return;
    setAssets((current) => {
      const additions = initialAssets.filter(
        (asset) =>
          asset.brandId === brandId &&
          !current.some((existing) => existing.id === asset.id),
      );
      return additions.length ? [...current, ...additions] : current;
    });
  }, [initialAssets, brandId]);
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
        <PromptEditorView
          key={brandId ? 'brand' : 'no-brand'}
          ariaLabel="Conversation prompt"
          className="min-h-6 min-w-0 w-full [&_.ProseMirror]:min-h-6"
          documentSeed={suggestedSeed}
          isDisabled={isDisabled}
          onSubmit={() => void handleSend()}
          onValueChange={setValue}
          placeholder={
            brandId
              ? 'What would you like to create?'
              : 'Select your brand to start creating'
          }
          value={value}
        />
        <PromptBarToolbar
          density="compact"
          leading={
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
          }
          trailing={
            <PromptBarSendButton
              ariaLabel="Send message"
              density="compact"
              isDisabled={isDisabled || !brandId || !value.trim()}
              onClick={() => void handleSend()}
            />
          }
        />
      </PromptBarComposer>
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

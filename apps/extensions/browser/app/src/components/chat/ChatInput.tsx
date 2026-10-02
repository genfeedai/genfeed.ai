import { ContentLibraryPicker } from '@genfeedai/agent/components/ContentLibraryPicker';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AgentArtifactReference } from '@genfeedai/contracts/interfaces';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import PromptBarAttachedAssetsTray from '@ui/components/prompt-bars/components/attached-assets-tray/PromptBarAttachedAssetsTray';
import PromptBarComposer from '@ui/components/prompt-bars/components/shell/PromptBarComposer';
import { ArrowUp, FolderOpen } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  libraryArtifactReferences,
  loadLibraryAssets,
  type LibraryAsset,
} from '~services/library.service';
import { useBrandStore } from '~store/use-brand-store';

interface ChatInputProps {
  onSend: (
    content: string,
    references?: AgentArtifactReference[],
  ) => Promise<boolean>;
  disabled?: boolean;
  suggestedPrompt?: string;
}

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
  const brandId = useBrandStore((s) => s.activeBrandId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scopeRef = useRef(brandId);
  scopeRef.current = brandId;

  useEffect(() => {
    if (suggestedPrompt) {
      setValue(suggestedPrompt);
      textareaRef.current?.focus();
    }
  }, [suggestedPrompt]);

  useEffect(() => {
    setAssets([]);
    setItems([]);
    setPage(1);
    setError(null);
    setIsOpen(false);
  }, [brandId]);

  useEffect(() => {
    if (!isOpen || !brandId) return;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    loadLibraryAssets(brandId, { page, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setItems((current) =>
          page === 1
            ? result.items
            : [
                ...new Map(
                  [...current, ...result.items].map((item) => [item.id, item]),
                ).values(),
              ],
        );
        setHasMore(result.hasMore);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Could not load Library.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [isOpen, brandId, page, reload]);

  async function handleSend() {
    const content = value.trim();
    if (!content || disabled || isSending || !brandId) return;
    const sentBrand = brandId;
    setIsSending(true);
    try {
      const accepted = await onSend(
        content,
        libraryArtifactReferences(assets, brandId),
      );
      if (accepted && scopeRef.current === sentBrand) {
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
    setPage(1);
    setItems([]);
    setIsOpen(true);
  }
  const isDisabled = Boolean(disabled || isSending);

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
        isLoading={isLoading && page === 1}
        items={items}
        selectedIds={new Set(assets.map((asset) => asset.id))}
        onOpenChange={setIsOpen}
        onSelect={(item) => {
          const asset = items.find((candidate) => candidate.id === item.id);
          if (asset && asset.brandId === brandId) {
            setAssets((current) =>
              current.some((existing) => existing.id === asset.id)
                ? current
                : [...current, asset],
            );
            setIsOpen(false);
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
              isDisabled={isLoading}
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

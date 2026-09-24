import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useCallback, useEffect, useState } from 'react';

import { BrandSelector } from '~components/settings/BrandSelector';
import {
  IMPORTED_POSTS_CHANGED,
  type ImportedPostSaveResponse,
  type ImportedPostsPageProps,
  type ImportedSourcePost,
} from '~models/imported-source-post.model';
import { appDomain } from '~services/environment.service';
import { useBrandStore } from '~store/use-brand-store';

type ImportStatus = 'idle' | 'importing' | 'imported' | 'already_imported';

const ALREADY_IMPORTED_STATUS =
  'Already imported for this brand. Metrics were refreshed. ' +
  'Knowledge was not changed.';
const IMPORTED_STATUS =
  'Imported with its author, text, and URL. Generation did not start.';

async function background<T>(message: Record<string, unknown>): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as
    | { data?: T; error?: string; success?: boolean }
    | undefined;
  if (!response?.success) {
    throw new Error(
      response?.error || 'The extension could not reach Genfeed. Try again.',
    );
  }
  return response.data as T;
}

function openUrl(url: string): void {
  chrome.tabs
    .create({ url })
    .catch(() => window.open(url, '_blank', 'noopener,noreferrer'));
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function authorLabel(post: ImportedSourcePost): string {
  const handle = post.authorHandle ? `@${post.authorHandle}` : '';
  if (post.authorDisplayName && handle) {
    return `${post.authorDisplayName} ${handle}`;
  }
  return post.authorDisplayName || handle || post.platform || 'Unknown author';
}

function ImportedSourceRow({ post }: { post: ImportedSourcePost }) {
  const sourceUrl = safeHttpUrl(post.sourceUrl);
  return (
    <div className="space-y-2 border border-border p-3">
      <p className="text-sm font-medium">{authorLabel(post)}</p>
      <p className="text-xs text-muted-foreground">
        Imported · {post.platform || 'post'}
      </p>
      {post.text ? (
        <p className="line-clamp-4 text-sm text-foreground">{post.text}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Original text is not available for this source.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {sourceUrl ? (
          <Button
            onClick={() => openUrl(sourceUrl)}
            type="button"
            variant={ButtonVariant.SECONDARY}
          >
            Open original
          </Button>
        ) : null}
        <Button
          onClick={() =>
            openUrl(`${appDomain}/discovery/overview?source=imported`)
          }
          type="button"
          variant={ButtonVariant.SECONDARY}
        >
          Remix
        </Button>
      </div>
    </div>
  );
}

export function ImportedPostsPage({
  initialUrl = '',
  onAddToKnowledge,
}: ImportedPostsPageProps) {
  const brandId = useBrandStore((state) => state.activeBrandId);
  const [url, setUrl] = useState(initialUrl);
  const [posts, setPosts] = useState<ImportedSourcePost[]>([]);
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (signal: AbortSignal) => {
      if (!brandId) {
        setPosts([]);
        return;
      }
      const next = await background<ImportedSourcePost[]>({
        brandId,
        event: 'listImportedPosts',
      });
      if (!signal.aborted) {
        setPosts(next);
      }
    },
    [brandId],
  );

  useEffect(() => {
    setUrl(initialUrl);
  }, [initialUrl]);

  useEffect(() => {
    if (!brandId) {
      return;
    }
    const controller = new AbortController();
    void chrome.runtime.sendMessage({ brandId, event: 'captureSetBrand' });
    return () => controller.abort();
  }, [brandId]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch((failure: unknown) => {
      if (!controller.signal.aborted) {
        setError(
          failure instanceof Error
            ? failure.message
            : 'Could not load Imported sources.',
        );
      }
    });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    function handleMessage(message: { type?: string }) {
      if (
        controller.signal.aborted ||
        message.type !== IMPORTED_POSTS_CHANGED
      ) {
        return;
      }
      void refresh(controller.signal).catch(() => undefined);
    }
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      controller.abort();
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [refresh]);

  async function importPost() {
    if (!brandId) {
      setError('Select a brand before importing this post.');
      return;
    }
    setStatus('importing');
    setError(null);
    try {
      const response = (await chrome.runtime.sendMessage({
        brandId,
        event: 'savePost',
        url,
      })) as ImportedPostSaveResponse | undefined;
      if (!response?.success) {
        setStatus('idle');
        setError(response?.error || 'Could not import this post.');
        return;
      }
      setStatus(response.deduplicated ? 'already_imported' : 'imported');
      await refresh(new AbortController().signal);
    } catch (failure) {
      setStatus('idle');
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not import this post.',
      );
    }
  }

  const statusText =
    status === 'importing'
      ? 'Importing…'
      : status === 'already_imported'
        ? ALREADY_IMPORTED_STATUS
        : status === 'imported'
          ? IMPORTED_STATUS
          : null;

  return (
    <div className="h-full space-y-4 overflow-y-auto p-3">
      <h2 className="text-sm font-semibold">Imported</h2>
      <p className="text-xs text-muted-foreground">
        Import a public X, Instagram, or TikTok post into this brand. Saving
        keeps the original post for remix. It does not add brand Knowledge or
        start generation.
      </p>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="space-y-1">
        <p className="text-xs font-medium">Brand</p>
        <BrandSelector />
      </div>
      <Input
        label="Post URL"
        name="imported-post-url"
        onChange={(event) => {
          setStatus('idle');
          setUrl(event.target.value);
        }}
        placeholder="https://x.com/author/status/123"
        value={url}
      />
      <Button
        disabled={!brandId || !url.trim() || status === 'importing'}
        onClick={() => {
          void importPost();
        }}
        type="button"
      >
        {status === 'importing' ? 'Importing…' : 'Import post'}
      </Button>
      {statusText ? (
        <p className="text-xs text-muted-foreground" role="status">
          {statusText}
        </p>
      ) : null}
      <Button
        disabled={!url.trim()}
        onClick={() => onAddToKnowledge(url.trim())}
        type="button"
        variant={ButtonVariant.SECONDARY}
      >
        Add to Knowledge
      </Button>
      <section aria-label="Imported sources" className="space-y-2">
        <h3 className="text-sm font-medium">Imported sources</h3>
        {posts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Imported posts for this brand will appear here.
          </p>
        ) : (
          posts.map((post) => <ImportedSourceRow key={post.id} post={post} />)
        )}
      </section>
    </div>
  );
}

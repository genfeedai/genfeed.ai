import { ButtonVariant, KnowledgeSourcePurpose } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BrandSelector } from '~components/settings/BrandSelector';
import type {
  CaptureMode,
  KnowledgeCapturePageProps,
  KnowledgeCaptureReceipt,
  KnowledgeCaptureSpace,
  KnowledgeSnapshot,
} from '~models/knowledge-capture.model';
import { appDomain } from '~services/environment.service';
import { useBrandStore } from '~store/use-brand-store';

async function background<T>(message: Record<string, unknown>): Promise<T> {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.success)
    throw new Error(
      response?.error || 'The extension could not reach Genfeed. Try again.',
    );
  return response.data as T;
}

export function KnowledgeCapturePage({
  initialContent = '',
  initialUrl = '',
  initialMode,
}: KnowledgeCapturePageProps) {
  const draftRevision = useRef(0);
  const brandId = useBrandStore((state) => state.activeBrandId);
  const [snapshot, setSnapshot] = useState<KnowledgeSnapshot>({
    mode: initialMode ?? (initialContent ? 'selection' : 'page'),
    title: '',
    url: initialUrl,
    text: initialContent,
  });
  const [purpose, setPurpose] = useState(KnowledgeSourcePurpose.INSPIRATION);
  const [spaceId, setSpaceId] = useState('inbox');
  const [spaces, setSpaces] = useState<KnowledgeCaptureSpace[]>([]);
  const [receipts, setReceipts] = useState<KnowledgeCaptureReceipt[]>([]);
  const [legacyCount, setLegacyCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setReceipts(
        await background<KnowledgeCaptureReceipt[]>({ event: 'captureList' }),
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Could not load captures.',
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
    void background<number>({ event: 'captureLegacyCount' })
      .then(setLegacyCount)
      .catch(() => undefined);
    void background<string | null>({ event: 'captureBrand' })
      .then((savedBrand) => {
        if (savedBrand && !useBrandStore.getState().activeBrandId)
          useBrandStore.getState().setActiveBrand(savedBrand);
      })
      .catch(() => undefined);
  }, [refresh]);
  useEffect(() => {
    if (
      !receipts.some(
        (row) => row.state === 'queued' || row.state === 'processing',
      )
    )
      return;
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [receipts, refresh]);

  useEffect(() => {
    let active = true;
    setSpaceId('inbox');
    draftRevision.current += 1;
    setSaved(false);
    setSpaces([]);
    if (brandId)
      background<KnowledgeCaptureSpace[]>({ event: 'captureSpaces', brandId })
        .then((next) => {
          if (active) setSpaces(next);
        })
        .catch((failure) => {
          if (active) setError(failure.message);
        });
    return () => {
      active = false;
    };
  }, [brandId]);

  useEffect(() => {
    let active = true;
    draftRevision.current += 1;
    setSaved(false);
    if (initialContent) {
      setSnapshot({
        mode: initialMode ?? 'selection',
        text: initialContent,
        title: '',
        url: initialUrl,
      });
      return;
    }
    if (!initialUrl) return;
    setBusy(true);
    background<KnowledgeSnapshot>({
      event: 'captureSnapshot',
      mode: initialMode ?? 'page',
      url: initialUrl,
    })
      .then((next) => {
        if (active) setSnapshot(next);
      })
      .catch((failure) => {
        if (active) {
          setSnapshot({ mode: 'link', title: '', url: initialUrl, text: '' });
          setError(`${failure.message} You can still save the link.`);
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [initialContent, initialUrl, initialMode]);

  async function capture() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      setSnapshot(
        await background<KnowledgeSnapshot>({
          event: 'captureSnapshot',
          mode: snapshot.mode,
          ...(snapshot.mode === 'link' && snapshot.url
            ? { url: snapshot.url }
            : {}),
        }),
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not capture this page.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!brandId) {
      setError('Select a brand before saving.');
      return;
    }
    setBusy(true);
    setError(null);
    const submittedRevision = draftRevision.current;
    try {
      const receipt = await background<KnowledgeCaptureReceipt>({
        event: 'captureSave',
        payload: {
          ...snapshot,
          brandId,
          purpose,
          ...(spaceId !== 'inbox' ? { spaceId } : {}),
        },
      });
      if (submittedRevision === draftRevision.current) setSaved(true);
      if (receipt.error) setError(receipt.error);
      await refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not save this capture.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function receiptAction(event: string, id: string) {
    setBusy(true);
    setError(null);
    try {
      await background({ event, id });
      await refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not update this capture.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function importIdeas() {
    setBusy(true);
    setError(null);
    try {
      await background({ event: 'captureImportLegacy', brandId });
      await refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not import saved ideas.',
      );
    } finally {
      try {
        setLegacyCount(
          await background<number>({ event: 'captureLegacyCount' }),
        );
      } finally {
        setBusy(false);
      }
    }
  }

  function update(change: Partial<KnowledgeSnapshot>) {
    draftRevision.current += 1;
    setSaved(false);
    setSnapshot((current) => ({ ...current, ...change }));
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-4">
      <h2 className="text-sm font-semibold">Save to Genfeed</h2>
      <p className="text-xs text-muted-foreground">
        Capture a page, passage or post in your brand’s Knowledge. Review the
        text before saving.
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="space-y-1">
        <p className="text-xs font-medium">Brand</p>
        <BrandSelector />
      </div>
      {!brandId && (
        <p className="text-xs text-muted-foreground">
          Select a brand to save to its Inbox.{' '}
          <a
            href={appDomain}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Open Genfeed to create a brand
          </a>
          .
        </p>
      )}
      <div className="space-y-1">
        <label htmlFor="capture-mode" className="text-xs font-medium">
          Capture
        </label>
        <Select
          value={snapshot.mode}
          onValueChange={(value) => update({ mode: value as CaptureMode })}
        >
          <SelectTrigger id="capture-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="page">Page</SelectItem>
            <SelectItem value="selection">Selected text</SelectItem>
            <SelectItem value="link">Link</SelectItem>
            <SelectItem value="social">Social post</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={ButtonVariant.SECONDARY}
          onClick={capture}
          disabled={busy}
        >
          Capture current tab
        </Button>
      </div>
      <div className="space-y-1">
        <label htmlFor="capture-url" className="text-xs font-medium">
          Source URL
        </label>
        <Input
          id="capture-url"
          value={snapshot.url}
          onChange={(event) => update({ url: event.target.value })}
          placeholder="https://…"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="capture-title" className="text-xs font-medium">
          Title
        </label>
        <Input
          id="capture-title"
          maxLength={500}
          value={snapshot.title}
          onChange={(event) => update({ title: event.target.value })}
          placeholder="Name this source"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="capture-text" className="text-xs font-medium">
          Captured text
        </label>
        <Textarea
          id="capture-text"
          rows={7}
          value={snapshot.text}
          onChange={(event) => update({ text: event.target.value })}
          placeholder="Capture a page or paste the passage you want to keep."
        />
        <p className="text-xs text-muted-foreground">
          Forms, hidden content and scripts are excluded. Remove any private
          information you don’t want saved.
        </p>
      </div>
      <div className="space-y-1">
        <label htmlFor="capture-purpose" className="text-xs font-medium">
          Purpose
        </label>
        <Select
          value={purpose}
          onValueChange={(value) => {
            draftRevision.current += 1;
            setPurpose(value as KnowledgeSourcePurpose);
            setSaved(false);
          }}
        >
          <SelectTrigger id="capture-purpose">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={KnowledgeSourcePurpose.INSPIRATION}>
              Inspiration
            </SelectItem>
            <SelectItem value={KnowledgeSourcePurpose.RESEARCH}>
              Research
            </SelectItem>
            <SelectItem value={KnowledgeSourcePurpose.BRAND_TRUTH}>
              Brand truth
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <label htmlFor="capture-space" className="text-xs font-medium">
          Space
        </label>
        <Select
          value={spaceId}
          onValueChange={(value) => {
            draftRevision.current += 1;
            setSpaceId(value);
            setSaved(false);
          }}
          disabled={!brandId}
        >
          <SelectTrigger id="capture-space">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inbox">Inbox</SelectItem>
            {spaces
              .filter((space) => !space.isInbox)
              .map((space) => (
                <SelectItem key={space.id} value={space.id}>
                  {space.title}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        onClick={save}
        disabled={
          busy ||
          saved ||
          !brandId ||
          (!snapshot.text.trim() && !snapshot.url.trim())
        }
      >
        {busy ? 'Working…' : saved ? 'Capture submitted' : 'Save to Genfeed'}
      </Button>
      {legacyCount > 0 && (
        <div className="border border-border p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            {legacyCount} older ideas are stored on this browser. Import them
            into the selected brand’s Knowledge.
          </p>
          <Button
            variant={ButtonVariant.SECONDARY}
            disabled={!brandId || busy}
            onClick={importIdeas}
          >
            Import saved ideas
          </Button>
        </div>
      )}
      <section className="space-y-2" aria-label="Recent captures">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Recent captures</h3>
          <Button
            variant={ButtonVariant.GHOST}
            onClick={refresh}
            disabled={busy}
          >
            Refresh
          </Button>
        </div>
        {!receipts.length && (
          <p className="text-xs text-muted-foreground">
            Your capture status will appear here.
          </p>
        )}
        {receipts
          .filter((row) => row.brandId === brandId)
          .map((row) => (
            <div key={row.id} className="border border-border p-3 space-y-2">
              <p className="text-sm font-medium">{row.title}</p>
              <p role="status" className="text-xs text-muted-foreground">
                {row.state === 'ready'
                  ? 'Ready in Knowledge'
                  : row.state === 'queued' || row.state === 'processing'
                    ? 'Saved · processing'
                    : row.state === 'failed'
                      ? row.error
                      : 'Waiting to save'}
              </p>
              {row.state === 'failed' && (
                <Button
                  variant={ButtonVariant.SECONDARY}
                  onClick={() => receiptAction('captureRetry', row.id)}
                  disabled={busy}
                >
                  Retry
                </Button>
              )}
              {row.draft && (
                <Button
                  variant={ButtonVariant.GHOST}
                  onClick={() => receiptAction('captureDiscard', row.id)}
                  disabled={busy}
                >
                  Discard pending capture
                </Button>
              )}
            </div>
          ))}
      </section>
    </div>
  );
}

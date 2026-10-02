import { ButtonVariant } from '@genfeedai/contracts';
import type {
  PublicationCaptureReply,
  PublicationCaptureView,
} from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';
import type { PublicationCaptureEntryProps } from '@genfeedai/props/extension/extension-publication-observer.props';
import { Button } from '@ui/primitives/button';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '~store/use-settings-store';
import { useWorkspaceStore } from '~store/use-workspace-store';

function PublicationCaptureEntry({
  entry,
  isEnabled,
  onRetry,
  onDismiss,
}: PublicationCaptureEntryProps): ReactElement {
  return (
    <div className="min-w-0 space-y-1 rounded-md border border-border p-2 text-xs">
      <p className="break-words text-foreground">
        {entry.description.slice(0, 120)}
      </p>
      <p className="text-muted-foreground">{entry.publicationDate}</p>
      {entry.error && (
        <p className="break-words text-destructive">{entry.error}</p>
      )}
      <div className="flex gap-2">
        <Button
          withWrapper={false}
          variant={ButtonVariant.SECONDARY}
          isDisabled={!isEnabled || entry.status === 'recording'}
          onClick={() => onRetry(entry.id)}
        >
          Retry
        </Button>
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          isDisabled={entry.status === 'recording'}
          onClick={() => onDismiss(entry.id)}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
export function PublicationRecordingSettings(): ReactElement {
  const enabled = useSettingsStore((state) => state.recordOwnPublications);
  const setEnabled = useSettingsStore(
    (state) => state.setRecordOwnPublications,
  );
  const workspace = useWorkspaceStore();
  const key =
    workspace.status === 'ready'
      ? `${workspace.snapshot.userId}:${workspace.snapshot.organizationId}:${workspace.snapshot.brandId}:${workspace.snapshot.revision}`
      : '';
  const scope = useRef(key);
  scope.current = key;
  const version = useRef(0);
  const [entries, setEntries] = useState<PublicationCaptureView[]>([]);
  const [message, setMessage] = useState('');
  const [listEnabled, setListEnabled] = useState(false);
  async function refresh() {
    const requestVersion = ++version.current;
    const requestKey = scope.current;
    if (!requestKey) return;
    try {
      const reply: PublicationCaptureReply = await chrome.runtime.sendMessage({
        event: 'publicationCaptureList',
      });
      if (requestVersion !== version.current || requestKey !== scope.current)
        return;
      if (reply.success && reply.data.kind === 'list') {
        setEntries(reply.data.entries);
        setListEnabled(reply.data.enabled);
      } else if (reply.success === false) setMessage(reply.error);
    } catch {
      if (requestVersion === version.current && requestKey === scope.current)
        setMessage('Could not load publication recordings. Retry in a moment.');
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: Snapshot revision and preference fence every list response.
  useEffect(() => {
    version.current++;
    setEntries([]);
    setMessage('');
    setListEnabled(false);
    void refresh();
    const changed = () => {
      void refresh();
    };
    chrome.storage.onChanged.addListener(changed);
    return () => {
      version.current++;
      chrome.storage.onChanged.removeListener(changed);
    };
  }, [key, enabled]);
  async function mutate(
    id: string,
    event: 'publicationCaptureRetry' | 'publicationCaptureDismiss',
  ) {
    const requestKey = scope.current;
    if (!requestKey) return;
    try {
      const reply: PublicationCaptureReply = await chrome.runtime.sendMessage({
        event,
        id,
      });
      if (requestKey !== scope.current) return;
      if (reply.success && reply.data.kind === 'recorded') {
        setMessage(
          reply.data.result.created
            ? 'Published post recorded in Genfeed'
            : 'Already in Genfeed',
        );
      } else if (reply.success === false) setMessage(reply.error);
      await refresh();
    } catch {
      if (requestKey === scope.current)
        setMessage('Could not update this recording. Retry.');
    }
  }
  return (
    <section className="min-w-0 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-sm text-foreground">
            Record my published posts
          </span>
          <p className="text-2xs text-muted-foreground">
            Save posts and replies you publish here to the selected Genfeed
            brand. This does not publish for you.
          </p>
        </div>
        <Button
          type="button"
          variant={ButtonVariant.UNSTYLED}
          role="switch"
          ariaLabel="Record my published posts"
          aria-checked={enabled}
          onClick={() => setEnabled(!enabled)}
          className={`relative h-5 w-9 shrink-0 rounded-full ${enabled ? 'bg-primary' : 'bg-border'}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-primary-foreground ${enabled ? 'translate-x-4' : 'translate-x-0'}`}
          />
        </Button>
      </div>
      <p className="text-2xs text-muted-foreground">
        Currently observing text posts from the X home composer. More publishing
        surfaces are being added.
      </p>
      <p
        role="status"
        aria-live="polite"
        className="break-words text-xs text-muted-foreground"
      >
        {message}
      </p>
      {entries.map((entry) => (
        <PublicationCaptureEntry
          key={entry.id}
          entry={entry}
          isEnabled={enabled && listEnabled && Boolean(key)}
          onRetry={(id) => void mutate(id, 'publicationCaptureRetry')}
          onDismiss={(id) => void mutate(id, 'publicationCaptureDismiss')}
        />
      ))}
    </section>
  );
}

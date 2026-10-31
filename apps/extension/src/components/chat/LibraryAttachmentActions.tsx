import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { LibraryAsset } from '@genfeedai/contracts/interfaces';
import type { LibraryAttachmentActionsProps } from '@genfeedai/props/extension/extension-library.props';
import { Button } from '@ui/primitives/button';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { handoffLibraryAsset } from '~services/library-handoff.service';

export function LibraryAttachmentActions({
  assets,
  isDisabled,
}: LibraryAttachmentActionsProps): ReactElement {
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const controllers = useRef(new Map<string, AbortController>());
  useEffect(() => {
    const ids = new Set(assets.map((asset) => asset.id));
    for (const [id, controller] of controllers.current) {
      if (!ids.has(id)) {
        controller.abort();
        controllers.current.delete(id);
      }
    }
    setStatuses((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id))),
    );
    setBusy((current) => new Set([...current].filter((id) => ids.has(id))));
  }, [assets]);
  useEffect(
    () => () => {
      for (const controller of controllers.current.values()) controller.abort();
      controllers.current.clear();
    },
    [],
  );
  async function handoff(asset: LibraryAsset, action: 'download' | 'open') {
    if (isDisabled || controllers.current.has(asset.id)) return;
    const controller = new AbortController();
    controllers.current.set(asset.id, controller);
    setBusy((current) => new Set([...current, asset.id]));
    try {
      const result = await handoffLibraryAsset(asset.reference, action, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted)
        setStatuses((current) => ({
          ...current,
          [asset.id]:
            result.kind === 'download-started'
              ? 'Download started. Attach the file using the platform’s attachment button.'
              : 'Asset opened. Save it, then attach it using the platform’s attachment button.',
        }));
    } catch {
      if (!controller.signal.aborted)
        setStatuses((current) => ({
          ...current,
          [asset.id]:
            'Could not retrieve this asset. Retry Download or Open asset. If it changed, remove it and select its current Library version.',
        }));
    } finally {
      if (controllers.current.get(asset.id) === controller)
        controllers.current.delete(asset.id);
      if (!controller.signal.aborted)
        setBusy(
          (current) => new Set([...current].filter((id) => id !== asset.id)),
        );
    }
  }
  return (
    <div className="mt-2 min-w-0 space-y-2 text-xs text-muted-foreground">
      <p>Download assets, then attach them manually on the platform.</p>
      {assets.map((asset) => (
        <div key={asset.id} className="min-w-0 space-y-1">
          <p className="truncate text-foreground" title={asset.contentTitle}>
            {asset.contentTitle}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              withWrapper={false}
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              ariaLabel={`Download ${asset.contentTitle}`}
              isDisabled={isDisabled || busy.has(asset.id)}
              onClick={() => void handoff(asset, 'download')}
            >
              Download
            </Button>
            <Button
              withWrapper={false}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              ariaLabel={`Open ${asset.contentTitle}`}
              isDisabled={isDisabled || busy.has(asset.id)}
              onClick={() => void handoff(asset, 'open')}
            >
              Open asset
            </Button>
          </div>
          <p role="status" aria-live="polite" className="break-words">
            {statuses[asset.id]}
          </p>
        </div>
      ))}
    </div>
  );
}

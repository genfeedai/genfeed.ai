import type {
  AgentArtifactReference,
  LibraryHandoffOptions,
  LibraryHandoffResult,
} from '@genfeedai/contracts/interfaces';
import { resolveLibraryAssetDelivery } from '~services/library.service';
import { assertWorkspace, requireWorkspace } from '~services/workspace.service';

export async function handoffLibraryAsset(
  reference: AgentArtifactReference,
  action: 'download' | 'open',
  options: LibraryHandoffOptions = {},
): Promise<LibraryHandoffResult> {
  const workspace = await requireWorkspace();
  const resolved = await resolveLibraryAssetDelivery(reference, options);
  assertWorkspace(workspace);
  options.signal?.throwIfAborted();
  try {
    if (action === 'download') {
      if (!globalThis.chrome?.downloads?.download) throw new Error();
      const downloadId = await chrome.downloads.download({
        url: resolved.url,
        saveAs: true,
      });
      if (!Number.isInteger(downloadId) || downloadId < 0) throw new Error();
      return { kind: 'download-started', downloadId };
    }
    if (!globalThis.chrome?.tabs?.create) throw new Error();
    await chrome.tabs.create({ url: resolved.url, active: true });
    return { kind: 'asset-opened' };
  } catch {
    throw new Error(
      action === 'download'
        ? 'Could not start the download. Retry or choose Open asset.'
        : 'Could not open this asset. Retry.',
    );
  }
}

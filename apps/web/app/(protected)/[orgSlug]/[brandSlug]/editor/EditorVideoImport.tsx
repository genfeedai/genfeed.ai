'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { EditorProjectsService } from '@services/editor/editor-projects.service';
import Spinner from '@ui/primitives/spinner';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

interface EditorVideoImportProps {
  /** Library video ids, in timeline order: one clip per video, back to back. */
  videoIds: readonly string[];
}

/**
 * Videos opened in the Editor (`/editor?video=<id>`, repeated): create a
 * project seeded with them and open it. Returns to the workspace if it fails.
 */
export default function EditorVideoImport({
  videoIds,
}: EditorVideoImportProps) {
  const { replace } = useRouter();
  const { href } = useOrgUrl();
  const videoIdsKey = videoIds.filter(Boolean).join(',');
  const creating = useRef(false);

  const getEditorService = useAuthedService((token: string) =>
    EditorProjectsService.getInstance(token),
  );

  useEffect(() => {
    if (creating.current) {
      return;
    }
    creating.current = true;

    const controller = new AbortController();

    (async () => {
      try {
        const service = await getEditorService();
        // Aborting in cleanup runs synchronously before these awaited
        // microtasks resolve, so a StrictMode-discarded mount bails out here
        // before creating a project — preserving create-once semantics while
        // still cancelling on a genuine unmount.
        if (controller.signal.aborted) {
          return;
        }

        const project = await service.create({
          name: 'Video Edit',
          sourceVideoIds: videoIdsKey.split(','),
        });
        if (controller.signal.aborted) {
          return;
        }

        replace(href(`${APP_ROUTES.STUDIO.EDITOR}/${project.id}`));
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to create editor project', error);
        creating.current = false;
        replace(href(APP_ROUTES.STUDIO.EDITOR));
      }
    })();

    return () => {
      controller.abort();
      creating.current = false;
    };
  }, [videoIdsKey, getEditorService, href, replace]);

  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner className="size-12 text-primary" />
    </div>
  );
}

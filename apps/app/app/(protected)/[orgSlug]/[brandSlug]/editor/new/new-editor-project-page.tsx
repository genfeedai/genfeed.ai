'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { EditorProjectsService } from '@services/editor/editor-projects.service';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';

function NewEditorProjectPageContent() {
  const { replace } = useRouter();
  const { href } = useOrgUrl();
  const searchParams = useSearchParams();
  const videoId = searchParams.get('video') || searchParams.get('videoId');
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
          name: videoId ? 'Video Edit' : 'Untitled Project',
          sourceVideoId: videoId ?? undefined,
        });
        if (controller.signal.aborted) {
          return;
        }

        replace(href(`/editor/${project.id}`));
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to create editor project', error);
        creating.current = false;
        replace(href('/editor'));
      }
    })();

    return () => {
      controller.abort();
      creating.current = false;
    };
  }, [videoId, getEditorService, href, replace]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="size-12 animate-spin rounded-full border-b-2 border-t-2 border-primary" />
    </div>
  );
}

export default function NewEditorProjectPage() {
  return (
    <Suspense fallback={null}>
      <NewEditorProjectPageContent />
    </Suspense>
  );
}

'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { EditorProjectsService } from '@services/editor/editor-projects.service';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';

function NewEditorProjectPageContent() {
  const { replace } = useRouter();
  const { get } = useSearchParams();
  const videoId = get('video') || get('videoId');
  const creating = useRef(false);

  const getEditorService = useAuthedService((token: string) =>
    EditorProjectsService.getInstance(token),
  );

  useEffect(() => {
    if (creating.current) {
      return;
    }
    creating.current = true;

    (async () => {
      try {
        const service = await getEditorService();
        const project = await service.create({
          name: videoId ? 'Video Edit' : 'Untitled Project',
          sourceVideoId: videoId ?? undefined,
        });

        replace(`/editor/${project.id}`);
      } catch (error) {
        logger.error('Failed to create editor project', error);
        creating.current = false;
        replace('/editor');
      }
    })();
  }, [videoId, getEditorService, replace]);

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

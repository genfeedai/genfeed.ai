'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { EditorProjectsService } from '@services/editor/editor-projects.service';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

export default function NewEditorProjectPage() {
  const router = useRouter();
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

    (async () => {
      try {
        const service = await getEditorService();
        const project = await service.create({
          name: videoId ? 'Video Edit' : 'Untitled Project',
          sourceVideoId: videoId ?? undefined,
        });

        router.replace(`/editor/${project.id}`);
      } catch (error) {
        logger.error('Failed to create editor project', error);
        creating.current = false;
        router.replace('/editor');
      }
    })();
  }, [videoId, getEditorService, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-primary" />
    </div>
  );
}

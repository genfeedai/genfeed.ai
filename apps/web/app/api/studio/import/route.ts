import { NextRequest, NextResponse } from 'next/server';
import { MIME_TYPES } from '@/lib/gallery/types';
import { persistRemoteAsset, STUDIO_WORKFLOW_ID } from '@/lib/core-storage';
import { logger } from '@/lib/logger';

function inferMediaType(assetPath: string): 'image' | 'video' {
  const normalized = assetPath.toLowerCase();
  if (normalized.endsWith('.mp4') || normalized.endsWith('.webm') || normalized.endsWith('.mov')) {
    return 'video';
  }

  return 'image';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const urls = Array.isArray(body.urls)
      ? (body.urls.filter((url: unknown): url is string => typeof url === 'string') as string[])
      : [];

    if (!urls.length) {
      return NextResponse.json({ error: 'At least one asset URL is required' }, { status: 400 });
    }

    const imported = await Promise.all(
      urls.map(async (remoteUrl: string, index: number) => {
        const saved = await persistRemoteAsset({
          prefix: `studio-${index + 1}`,
          remoteUrl,
          workflowId: STUDIO_WORKFLOW_ID,
        });

        const mimeType =
          Object.entries(MIME_TYPES).find(([extension]) =>
            saved.path.toLowerCase().endsWith(extension)
          )?.[1] ?? 'application/octet-stream';

        return {
          mediaType: inferMediaType(saved.path),
          mimeType,
          name: saved.path.split('/').pop() ?? saved.path,
          path: saved.path,
          sourceUrl: remoteUrl,
        };
      })
    );

    return NextResponse.json({ items: imported });
  } catch (error) {
    logger.error('Studio import error', error, { context: 'api/studio/import' });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import assets' },
      { status: 500 }
    );
  }
}

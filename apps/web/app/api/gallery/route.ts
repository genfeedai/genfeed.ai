import {
  AUDIO_EXTENSIONS,
  type GalleryFilterType,
  type GalleryItem,
  type GalleryResponse,
  IMAGE_EXTENSIONS,
  MIME_TYPES,
  VIDEO_EXTENSIONS,
} from '@/lib/gallery/types';
import { type NextRequest, NextResponse } from 'next/server';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), '../../data/workflows');
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

function getFileType(ext: string): 'image' | 'video' | 'audio' | null {
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return 'image';
  if ((VIDEO_EXTENSIONS as readonly string[]).includes(ext)) return 'video';
  if ((AUDIO_EXTENSIONS as readonly string[]).includes(ext)) return 'audio';
  return null;
}

async function getFilesFromWorkflowOutput(workflowId: string): Promise<GalleryItem[]> {
  const items: GalleryItem[] = [];
  const outputDir = path.join(DATA_DIR, workflowId, 'output');

  try {
    const files = await readdir(outputDir);

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const type = getFileType(ext);
      if (!type) continue;

      const filePath = path.join(outputDir, file);
      const fileStat = await stat(filePath);

      if (!fileStat.isFile()) continue;

      const relativePath = `${workflowId}/output/${file}`;
      items.push({
        id: Buffer.from(relativePath).toString('base64url'),
        mimeType: MIME_TYPES[ext] || 'application/octet-stream',
        modifiedAt: fileStat.mtime.toISOString(),
        name: file,
        path: relativePath,
        size: fileStat.size,
        type,
      });
    }
  } catch {
    // Output directory doesn't exist or is not readable
  }

  return items;
}

function computeCounts(items: GalleryItem[]): GalleryResponse['counts'] {
  const counts = { all: items.length, audio: 0, image: 0, video: 0 };
  for (const item of items) {
    counts[item.type]++;
  }
  return counts;
}

export async function GET(request: NextRequest): Promise<NextResponse<GalleryResponse>> {
  const { searchParams } = request.nextUrl;

  const pageParam = Math.max(1, Number(searchParams.get('page')) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE)
  );
  const typeFilter = (searchParams.get('type') || 'all') as GalleryFilterType;

  let workflowIds: string[] = [];

  try {
    workflowIds = await readdir(DATA_DIR);
  } catch {
    // Data directory doesn't exist
    return NextResponse.json({
      counts: { all: 0, audio: 0, image: 0, video: 0 },
      items: [],
      page: 1,
      pageSize,
      total: 0,
      totalPages: 0,
    });
  }

  const allItems = await Promise.all(workflowIds.map((id) => getFilesFromWorkflowOutput(id)));

  const sortedItems = allItems
    .flat()
    .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

  const counts = computeCounts(sortedItems);

  const filteredItems =
    typeFilter === 'all' ? sortedItems : sortedItems.filter((item) => item.type === typeFilter);

  const total = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageParam, totalPages);

  const start = (page - 1) * pageSize;
  const items = filteredItems.slice(start, start + pageSize);

  return NextResponse.json({
    counts,
    items,
    page,
    pageSize,
    total,
    totalPages,
  });
}

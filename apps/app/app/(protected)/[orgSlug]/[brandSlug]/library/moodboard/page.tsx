import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import MoodBoardCanvasClient from '@/features/moodboard/MoodBoardCanvasClient';

export const generateMetadata = createPageMetadata('Mood Board');

function MoodBoardPageFallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background text-sm text-foreground/60">
      Loading mood board…
    </div>
  );
}

export default function LibraryMoodboardPage() {
  return (
    <Suspense fallback={<MoodBoardPageFallback />}>
      <MoodBoardCanvasClient />
    </Suspense>
  );
}

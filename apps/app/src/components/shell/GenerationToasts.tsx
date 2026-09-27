'use client';

import { useGenerationToasts } from '@/components/shell/use-generation-toasts';

/** Mounts the generation completion toasts beside the bell. */
export default function GenerationToasts() {
  useGenerationToasts();
  return null;
}

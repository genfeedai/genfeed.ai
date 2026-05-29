import type { ReactElement } from 'react';
import { HiCheck } from 'react-icons/hi2';

export function VoiceCloneDoneState(): ReactElement {
  return (
    <div className="my-2 border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
        <HiCheck className="size-5" />
        <span className="text-sm font-medium">
          Voice is ready and set for this brand
        </span>
      </div>
    </div>
  );
}

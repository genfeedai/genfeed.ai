import { Check } from 'lucide-react';
import type { ReactElement } from 'react';

export function VoiceCloneDoneState(): ReactElement {
  return (
    <div className="my-2 border border-success/20 bg-success/10 p-4  ">
      <div className="flex items-center gap-2 text-success ">
        <Check className="size-5" />
        <span className="text-sm font-medium">
          Voice is ready and set for this brand
        </span>
      </div>
    </div>
  );
}

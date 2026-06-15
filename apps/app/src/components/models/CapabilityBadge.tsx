'use client';

import type { ModelCapability } from '@genfeedai/types';
import { ModelCapabilityEnum } from '@genfeedai/types';

const CAPABILITY_LABELS: Record<ModelCapability, string> = {
  [ModelCapabilityEnum.TEXT_TO_IMAGE]: 'txt->img',
  [ModelCapabilityEnum.IMAGE_TO_IMAGE]: 'img->img',
  [ModelCapabilityEnum.TEXT_TO_VIDEO]: 'txt->vid',
  [ModelCapabilityEnum.IMAGE_TO_VIDEO]: 'img->vid',
  [ModelCapabilityEnum.TEXT_GENERATION]: 'txt->txt',
};

export function CapabilityBadge({
  capability,
}: {
  capability: ModelCapability;
}) {
  return (
    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
      {CAPABILITY_LABELS[capability]}
    </span>
  );
}

export default CapabilityBadge;

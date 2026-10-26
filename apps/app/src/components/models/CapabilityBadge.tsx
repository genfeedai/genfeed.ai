'use client';

import type { ModelCapability } from '@genfeedai/contracts/types';
import { ModelCapabilityEnum } from '@genfeedai/contracts/types';
import { Badge } from '@ui/primitives/badge';

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
  return <Badge variant="secondary">{CAPABILITY_LABELS[capability]}</Badge>;
}

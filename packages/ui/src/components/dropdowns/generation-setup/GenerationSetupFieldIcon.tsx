'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  GenerationSetupFieldIconProps,
  GenerationSetupFieldKey,
} from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import {
  Aperture,
  Camera,
  Clapperboard,
  Clock3,
  Copy,
  FileText,
  Gauge,
  Lightbulb,
  type LucideIcon,
  Megaphone,
  Move3d,
  Palette,
  Ratio,
  ScanLine,
  Shapes,
  Smile,
  Sparkles,
  WandSparkles,
} from 'lucide-react';

const SOURCE_LABEL: Record<GenerationSetupFieldIconProps['source'], string> = {
  agent: 'Set by the agent',
  preset: 'Pinned from a preset',
  user: 'Set by you',
};

const FIELD_ICON: Record<GenerationSetupFieldKey, LucideIcon> = {
  aspectRatio: Ratio,
  brandingMode: Megaphone,
  camera: Camera,
  cameraMovement: Move3d,
  duration: Clock3,
  isPromptEnhanceEnabled: WandSparkles,
  lens: Aperture,
  lighting: Lightbulb,
  modelKey: Sparkles,
  mood: Smile,
  outputs: Copy,
  prioritize: Gauge,
  promptTemplate: FileText,
  resolution: ScanLine,
  scene: Clapperboard,
  style: Palette,
  type: Shapes,
};

const FIELD_LABEL: Record<GenerationSetupFieldKey, string> = {
  aspectRatio: 'Aspect ratio',
  brandingMode: 'Brand voice',
  camera: 'Camera',
  cameraMovement: 'Camera movement',
  duration: 'Duration',
  isPromptEnhanceEnabled: 'Prompt enhance',
  lens: 'Lens',
  lighting: 'Lighting',
  modelKey: 'Model',
  mood: 'Mood',
  outputs: 'Outputs',
  prioritize: 'Routing priority',
  promptTemplate: 'Prompt template',
  resolution: 'Resolution',
  scene: 'Scene',
  style: 'Style',
  type: 'Type',
};

export default function GenerationSetupFieldIcon({
  fieldKey,
  reason,
  source,
}: GenerationSetupFieldIconProps) {
  const Icon = FIELD_ICON[fieldKey];
  const sourceLabel = reason ?? SOURCE_LABEL[source];
  const label = `${FIELD_LABEL[fieldKey]}: ${sourceLabel}`;

  return (
    <SimpleTooltip label={label} position="top">
      <span
        aria-label={label}
        className={cn(
          'inline-flex size-4 shrink-0 items-center justify-center',
          source === 'agent' && 'text-primary',
          source === 'preset' && 'text-foreground',
          source === 'user' && 'text-muted-foreground',
        )}
        role="img"
      >
        <Icon aria-hidden="true" className="size-3.5" />
      </span>
    </SimpleTooltip>
  );
}

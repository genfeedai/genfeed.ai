import { STORYBOARD_STARTER_PRESETS } from '@genfeedai/contracts/constants/storyboard-presets.constant';
import { Layers, Rocket, UserRound } from 'lucide-react';
import type {
  StoryboardPreset,
  StoryboardPresetId,
} from '@/features/studio/props/storyboard-presets.props';

const ICONS: Record<StoryboardPresetId, StoryboardPreset['icon']> = {
  beforeAfter: Layers,
  founderStory: UserRound,
  productLaunch: Rocket,
};

/**
 * Brand-neutral starting points for the Storyboard landing, shown when the
 * agent has no briefs for the brand yet (three at most).
 * The briefs live in `@genfeedai/contracts` so the MCP server lists the same
 * rows; this adds the icon and thumbnail. Titles and descriptions are i18n
 * under `pages.studioStoryboard.presets.<id>`.
 */
export const STORYBOARD_PRESETS: readonly StoryboardPreset[] =
  STORYBOARD_STARTER_PRESETS.map((preset) => ({
    ...preset,
    icon: ICONS[preset.id],
    thumbnailSrc: `/storyboard-presets/${preset.id}.webp`,
  }));

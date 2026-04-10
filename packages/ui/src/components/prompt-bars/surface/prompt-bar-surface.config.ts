import type { PromptBarSurfaceConfig } from '@genfeedai/props/prompt-bars/prompt-bar-surface.props';

export const STUDIO_PROMPT_BAR_SURFACE: PromptBarSurfaceConfig = {
  container: {
    layoutMode: 'surface-fixed',
    maxWidth: '4xl',
    zIndex: 50,
  },
};

export const POSTS_PROMPT_BAR_SURFACE: PromptBarSurfaceConfig = {
  container: {
    layoutMode: 'fixed',
    maxWidth: '4xl',
    zIndex: 50,
  },
};

export const MISSION_CONTROL_PROMPT_BAR_SURFACE: PromptBarSurfaceConfig = {
  container: {
    layoutMode: 'surface-fixed',
    maxWidth: 'full',
    zIndex: 20,
  },
};

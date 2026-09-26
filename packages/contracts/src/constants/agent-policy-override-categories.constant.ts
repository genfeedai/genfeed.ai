import { ModelCategory } from '..';

/**
 * Which catalog categories each agent-policy model override selector may
 * pick from. Single source of truth for both the settings-page pickers
 * (`resolve-enabled-model-options.ts`) and the server-side validation that
 * rejects an override key outside its selector's enabled, category-scoped
 * catalog (`organizations-settings.controller.ts`) — the two must never
 * drift apart, or a key the picker would show as invalid could still be
 * accepted (or vice versa).
 */
export const AGENT_TEXT_OVERRIDE_CATEGORIES: readonly ModelCategory[] = [
  ModelCategory.TEXT,
];

export const AGENT_MEDIA_OVERRIDE_CATEGORIES: readonly ModelCategory[] = [
  ModelCategory.IMAGE,
  ModelCategory.IMAGE_EDIT,
  ModelCategory.VIDEO,
  ModelCategory.VIDEO_EDIT,
];

export const AGENT_THINKING_OVERRIDE_CATEGORIES =
  AGENT_TEXT_OVERRIDE_CATEGORIES;
export const AGENT_REVIEW_OVERRIDE_CATEGORIES = AGENT_TEXT_OVERRIDE_CATEGORIES;
export const AGENT_GENERATION_OVERRIDE_CATEGORIES =
  AGENT_MEDIA_OVERRIDE_CATEGORIES;

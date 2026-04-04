/**
 * Centralized error message strings.
 *
 * Grouped by domain. Use these instead of hardcoding error strings
 * to keep copy consistent across the app.
 */
export const ERROR_MESSAGES = {
  GENERIC: {
    DELETE_FAILED: 'Failed to delete. Please try again.',
    LOAD_FAILED: 'Failed to load. Please try again.',
    NOT_FOUND: 'Not found',
    UPDATE_FAILED: 'Failed to update. Please try again.',
  },
  INGREDIENTS: {
    LOAD_FAILED: 'Failed to load ingredient',
    NOT_FOUND: 'Ingredient not found',
  },
  POSTS: {
    DELETE_FAILED: 'Failed to delete post. Please try again.',
    LOAD_FAILED: 'Failed to load posts',
  },
  TAGS: {
    DELETE_FAILED: 'Failed to delete tag',
    LOAD_FAILED: 'Failed to load tags',
    UPDATE_FAILED: 'Failed to update tag status',
  },
} as const;

/**
 * @genfeedai/prompts - Shared prompt templates library
 *
 * This package contains all official prompt templates for GenFeed AI
 * workflows, organized by category and optimized for marketplace seeding.
 */

// Export registry and functions
export {
  getAllPrompts,
  getPrompt,
  getPromptCategories,
  getPromptJson,
  getPromptsByCategory,
  PROMPT_CATEGORIES,
  PROMPT_REGISTRY,
  searchPromptsByTag,
} from './registry.js';
// Export all types
export type {
  PromptCatalog,
  PromptCategory,
  PromptTemplate,
  PromptVariable,
} from './types.js';

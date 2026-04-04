/**
 * Seed Script: Prompt Templates
 *
 * Seeds prompt templates into the `templates` collection (purpose: 'prompt').
 * These are system-level templates used by AI generation services.
 *
 * Uses upsert logic with field diffing - safe to run multiple times.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/prompt-templates.seed.ts
 *   bun run apps/server/api/scripts/seeds/prompt-templates.seed.ts --dry-run
 *   bun run apps/server/api/scripts/seeds/prompt-templates.seed.ts --env=production
 */

import { runScript } from '@api-scripts/db/connection';
import { parseArgs, seedDocuments } from '@api-scripts/db/seed-utils';
import { Logger } from '@nestjs/common';

const logger = new Logger('PromptTemplatesSeed');

const COLLECTION_NAME = 'templates';

const FIELDS_TO_CHECK = [
  'content',
  'description',
  'label',
  'variables',
  'isActive',
  'isDeleted',
  'version',
];

interface PromptTemplateDocument {
  key: string;
  purpose: 'prompt';
  label: string;
  description: string;
  content: string;
  variables: Array<{
    name: string;
    label: string;
    description: string;
    type: string;
    required: boolean;
  }>;
  version: number;
  isActive: boolean;
  isDeleted: boolean;
  organization: null;
  scope: string;
  isFeatured: boolean;
  usageCount: number;
  rating: number;
  ratingCount: number;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const PROMPT_TEMPLATES: PromptTemplateDocument[] = [
  // ─── X Article: User Prompt ───────────────────────────────────────────
  {
    content: `Write a long-form X Article (Twitter article) based on this idea: {{prompt}}

Target length: approximately {{targetWordCount}} words.
Tone: {{tone}}
{{#if keywords}}Keywords to incorporate: {{keywords}}{{/if}}

Structure the article with 4-8 clearly defined sections. Each section should have:
- A compelling heading (short, punchy — X style)
- Rich content in HTML format using <p>, <ul>, <ol>, <strong>, <em> tags
- Optionally, a standout pull quote (a single sentence that captures the section's key insight)

Writing style guidelines:
- Write for X's audience: sharp, opinionated, high-signal
- Lead with insights, not throat-clearing
- Use short paragraphs (2-3 sentences max)
- Include concrete examples, data points, or anecdotes
- Make every sentence earn its place
- End with a strong takeaway or call to action

Return ONLY valid JSON in this exact format:
{
  "title": "Compelling article title (max 100 chars)",
  "slug": "url-friendly-slug",
  "summary": "Brief overview that hooks the reader (150-200 chars)",
  "tags": ["tag1", "tag2", "tag3"],
  "sections": [
    {
      "heading": "Section Heading",
      "content": "<p>Section content in HTML...</p>",
      "pullQuote": "Optional standout quote from this section"
    }
  ]
}`,
    description:
      'Generates a long-form X Article with structured sections, pull quotes, and X-optimized writing style',
    isActive: true,
    isDeleted: false,
    isFeatured: false,
    key: 'prompt.x-article.generate',
    label: 'X Article Generation',
    organization: null,
    purpose: 'prompt',
    rating: 0,
    ratingCount: 0,
    scope: 'system',
    usageCount: 0,
    variables: [
      {
        description: 'The topic or idea for the article',
        label: 'Prompt',
        name: 'prompt',
        required: true,
        type: 'text',
      },
      {
        description: 'Target word count for the article',
        label: 'Target Word Count',
        name: 'targetWordCount',
        required: true,
        type: 'number',
      },
      {
        description: 'Writing tone (e.g., authoritative, conversational)',
        label: 'Tone',
        name: 'tone',
        required: true,
        type: 'text',
      },
      {
        description: 'Comma-separated keywords to incorporate',
        label: 'Keywords',
        name: 'keywords',
        required: false,
        type: 'text',
      },
    ],
    version: 1,
  },

  // ─── X Article: System Prompt ─────────────────────────────────────────
  {
    content: `You are an expert long-form writer for X (Twitter) Articles. You create high-quality, structured articles that perform well on X's platform.

Your writing principles:
1. Lead with value — every paragraph must teach, provoke, or reveal something
2. Use concrete specifics over vague generalities
3. Write in a direct, confident voice — no hedging or filler
4. Structure content with clear sections and pull quotes for skimmability
5. Optimize for X's reading experience: punchy headings, short paragraphs, strong hooks
6. Balance depth with accessibility — expert insights in plain language

Output requirements:
- Return ONLY valid JSON — no markdown, no explanation, no commentary
- All content fields must use proper HTML tags (<p>, <h2>, <ul>, <ol>, <strong>, <em>, <blockquote>)
- Sections should flow logically and build on each other
- Pull quotes should be standalone insights that work out of context`,
    description:
      'System prompt that guides AI behavior for X Article generation',
    isActive: true,
    isDeleted: false,
    isFeatured: false,
    key: 'system.x-article',
    label: 'X Article System Prompt',
    organization: null,
    purpose: 'prompt',
    rating: 0,
    ratingCount: 0,
    scope: 'system',
    usageCount: 0,
    variables: [],
    version: 1,
  },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const args = parseArgs();

runScript(
  'Prompt Templates Seed',
  async (db) => {
    return await seedDocuments(db, COLLECTION_NAME, PROMPT_TEMPLATES, {
      dryRun: args.dryRun,
      fieldsToCheck: FIELDS_TO_CHECK,
      keyField: 'key',
    });
  },
  {
    database: args.database,
    uri: args.uri,
  },
).catch((error) => {
  logger.error('Seed failed:', error);
  process.exit(1);
});

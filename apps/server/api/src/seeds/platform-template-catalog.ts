import {
  ContentTemplateKey,
  PromptTemplateKey,
  TemplateCategory,
} from '@genfeedai/contracts';

// A type alias, not an interface: it is written to a Prisma Json column, and
// only aliases carry the implicit index signature `InputJsonObject` needs.
export type PlatformTemplateVariable = {
  description: string;
  label: string;
  name: string;
  required: boolean;
  type: 'text';
};

export interface PlatformTemplateDefinition {
  category: TemplateCategory;
  content: string;
  description: string;
  key: string;
  label: string;
  tags: string[];
  variables: PlatformTemplateVariable[];
}

const PROMPT_VARIABLE: PlatformTemplateVariable = {
  description: 'The prompt the user typed',
  label: 'Prompt',
  name: 'prompt',
  required: true,
  type: 'text',
};

function variable(
  name: string,
  label: string,
  description: string,
  required: boolean,
): PlatformTemplateVariable {
  return { description, label, name, required, type: 'text' };
}

/**
 * The brief for standard article generation. Article generation reads this
 * key from the database and fails the whole workflow when it is missing, so
 * it is seeded here. The reply shape matches what the article parser reads
 * (`articles[]` with label, slug, summary, HTML content and tags).
 */
const ARTICLE_GENERATE_CONTENT = `Write {{count}} article draft(s) for the brief below.

Brief: {{{prompt}}}
{{#if category}}Category: {{{category}}}
{{/if}}{{#if keywords}}Keywords to work in naturally: {{{keywords}}}
{{/if}}
Write each article in the brand's voice from the context you were given. Be specific and concrete, avoid filler, and do not invent facts, numbers or quotes.

Format the article body as HTML using only <h2>, <h3>, <p>, <ul>, <ol> and <li> tags. Start with a short introduction and end with a clear takeaway.

Respond with JSON only, without markdown fences, in exactly this shape:
{"articles": [{"label": "Article title", "slug": "article-title", "summary": "One or two sentence summary", "content": "<h2>Heading</h2><p>Body</p>", "tags": ["tag"]}]}

Return exactly {{count}} item(s) in "articles".`;

/**
 * The brief for X Article generation. The X Article path reads this key from
 * the database too, and its reply shape is a single article split into
 * sections (`title`, `sections[]`), not the `articles[]` list above.
 */
const X_ARTICLE_GENERATE_CONTENT = `Write one long-form X Article for the brief below.

Brief: {{{prompt}}}
Tone: {{{tone}}}
Target length: about {{targetWordCount}} words.
{{#if keywords}}Keywords to work in naturally: {{{keywords}}}
{{/if}}
Write in the brand's voice from the context you were given. Open with a strong hook, make each section earn its place, and end with a clear takeaway. Be specific and concrete, avoid filler, and do not invent facts, numbers or quotes.

Section "content" is HTML using only <p>, <ul>, <ol>, <li> and <strong> tags. Do not repeat the heading inside it.

Respond with JSON only, without markdown fences, in exactly this shape:
{"title": "Article title", "slug": "article-title", "summary": "One or two sentence summary", "sections": [{"heading": "Section heading", "content": "<p>Body</p>", "pullQuote": "Optional standout line"}], "tags": ["tag"]}`;

/**
 * The platform defaults `PromptBuilderService` resolves for each model
 * category, plus the article brief. The category defaults pass the prompt
 * through unchanged (triple braces: no HTML escaping), so seeding them keeps
 * generation exactly as it was while making the keys visible, and overridable
 * per organization.
 */
export const PLATFORM_TEMPLATES: readonly PlatformTemplateDefinition[] = [
  {
    category: TemplateCategory.VIDEO,
    content: '{{{prompt}}}',
    description: 'Default video prompt. Passes the prompt through unchanged.',
    key: ContentTemplateKey.VIDEO_DEFAULT,
    label: 'Video default',
    tags: ['system', 'video'],
    variables: [PROMPT_VARIABLE],
  },
  {
    category: TemplateCategory.IMAGE,
    content: '{{{prompt}}}',
    description: 'Default image prompt. Passes the prompt through unchanged.',
    key: ContentTemplateKey.IMAGE_DEFAULT,
    label: 'Image default',
    tags: ['system', 'image'],
    variables: [PROMPT_VARIABLE],
  },
  {
    category: TemplateCategory.MUSIC_GENERATION,
    content: '{{{prompt}}}',
    description: 'Default music prompt. Passes the prompt through unchanged.',
    key: ContentTemplateKey.MUSIC_DEFAULT,
    label: 'Music default',
    tags: ['system', 'music'],
    variables: [PROMPT_VARIABLE],
  },
  {
    category: TemplateCategory.CAPTION,
    content: '{{{prompt}}}',
    description: 'Default text prompt. Passes the prompt through unchanged.',
    key: PromptTemplateKey.TEXT_DEFAULT,
    label: 'Text default',
    tags: ['system', 'text'],
    variables: [PROMPT_VARIABLE],
  },
  {
    category: TemplateCategory.ARTICLE_GENERATION,
    content: ARTICLE_GENERATE_CONTENT,
    description:
      'Brief for standard article generation. Asks for a JSON list of article drafts.',
    key: PromptTemplateKey.ARTICLE_GENERATE,
    label: 'Article generation',
    tags: ['system', 'article'],
    variables: [
      PROMPT_VARIABLE,
      variable('count', 'Count', 'How many drafts to write', true),
      variable('category', 'Category', 'The article category', false),
      variable('keywords', 'Keywords', 'Comma-separated keywords', false),
    ],
  },
  {
    category: TemplateCategory.ARTICLE_GENERATION,
    content: X_ARTICLE_GENERATE_CONTENT,
    description:
      'Brief for X Article generation. Asks for one article as JSON sections.',
    key: PromptTemplateKey.X_ARTICLE_GENERATE,
    label: 'X Article generation',
    tags: ['system', 'article', 'x'],
    variables: [
      PROMPT_VARIABLE,
      variable('tone', 'Tone', 'The writing tone', true),
      variable(
        'targetWordCount',
        'Target word count',
        'Approximate length',
        true,
      ),
      variable('keywords', 'Keywords', 'Comma-separated keywords', false),
    ],
  },
];

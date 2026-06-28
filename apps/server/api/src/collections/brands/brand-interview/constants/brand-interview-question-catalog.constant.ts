import type {
  BrandInterviewAnswerType,
  BrandInterviewGroup,
  IBrandInterviewQuestion,
} from '@genfeedai/interfaces';

export const BRAND_INTERVIEW_CREDIT_COST = 10;

/**
 * In-scope storage location for a field: which sub-object on the Brand holds it.
 */
export type BrandFieldStorage = 'brand' | 'voice' | 'strategy';

export interface BrandFieldMeta {
  group: BrandInterviewGroup;
  answerType: BrandInterviewAnswerType;
  storage: BrandFieldStorage;
}

/**
 * Lookup map from fieldKey → group, answerType, storage.
 * Derived directly from the canonical field map in the spec.
 */
export const BRAND_FIELD_META: Record<string, BrandFieldMeta> = {
  // identity → Brand columns
  description: { answerType: 'text', group: 'identity', storage: 'brand' },
  text: { answerType: 'text', group: 'identity', storage: 'brand' },

  // voice → agentConfig.voice.*
  tone: { answerType: 'text', group: 'voice', storage: 'voice' },
  style: { answerType: 'text', group: 'voice', storage: 'voice' },
  audience: { answerType: 'list', group: 'voice', storage: 'voice' },
  values: { answerType: 'list', group: 'voice', storage: 'voice' },
  messagingPillars: { answerType: 'list', group: 'voice', storage: 'voice' },
  sampleOutput: { answerType: 'text', group: 'voice', storage: 'voice' },
  doNotSoundLike: { answerType: 'list', group: 'voice', storage: 'voice' },

  // strategy → agentConfig.strategy.*
  goals: { answerType: 'list', group: 'strategy', storage: 'strategy' },
  contentTypes: { answerType: 'list', group: 'strategy', storage: 'strategy' },
  platforms: { answerType: 'list', group: 'strategy', storage: 'strategy' },
  frequency: { answerType: 'text', group: 'strategy', storage: 'strategy' },
} as const;

/**
 * Ordered catalog of all 13 in-scope interview questions.
 * Order = catalog order from spec: identity → voice → strategy.
 * This order determines the sequence in which gaps are asked.
 */
export const BRAND_INTERVIEW_QUESTION_CATALOG: IBrandInterviewQuestion[] = [
  // ── IDENTITY ──────────────────────────────────────────────────────────────
  {
    answerType: 'text',
    examples: [
      'We help indie makers ship faster by automating content distribution.',
      'A B2B SaaS that removes manual data entry from finance teams.',
    ],
    fieldKey: 'description',
    group: 'identity',
    hint: 'One to three sentences. Focus on who you help and what problem you solve.',
    isRequired: true,
    questionText:
      "What does your brand do? Give a short description of your brand's purpose and audience.",
    weight: 10,
  },
  {
    answerType: 'text',
    examples: [
      'You are a knowledgeable but approachable assistant for Acme Inc., a startup that helps e-commerce brands automate their social media. Keep your tone friendly, concise, and data-driven.',
      'You represent BoldCraft Studio. Your writing is bold, slightly edgy, and always action-oriented. Prioritize short sentences and strong verbs.',
    ],
    fieldKey: 'text',
    group: 'identity',
    hint: "This is the system-level instruction that shapes all AI-generated content. Think of it as the brand's personality brief — include your brand name, core mission, content style, and any absolute do-nots.",
    isRequired: false,
    questionText:
      "Write your brand's AI system prompt. This text tells the AI exactly how to write as your brand across all content types.",
    weight: 9,
  },

  // ── VOICE ─────────────────────────────────────────────────────────────────
  {
    answerType: 'text',
    examples: [
      'Professional yet warm',
      'Playful and irreverent',
      'Authoritative and concise',
    ],
    fieldKey: 'tone',
    group: 'voice',
    hint: 'Use a short phrase — adjectives work well here.',
    isRequired: true,
    questionText:
      "What is your brand's communication tone? Describe the overall feel of how your brand speaks.",
    weight: 8,
  },
  {
    answerType: 'text',
    examples: [
      'Short punchy sentences, always ends with a clear call-to-action',
      'Storytelling-first, long-form, lots of data and citations',
    ],
    fieldKey: 'style',
    group: 'voice',
    hint: 'Think about sentence length, structure, and any signature writing habits.',
    isRequired: false,
    questionText:
      'How would you describe your writing style? Explain how your brand structures and delivers its message.',
    weight: 7,
  },
  {
    answerType: 'list',
    examples: [
      'Startup founders',
      'Marketing managers at SMBs',
      'Freelance designers aged 25-40',
    ],
    fieldKey: 'audience',
    group: 'voice',
    hint: 'Enter one audience segment per line. Be as specific as possible.',
    isRequired: true,
    questionText:
      'Who is your target audience? List the main groups of people you create content for.',
    weight: 8,
  },
  {
    answerType: 'list',
    examples: ['Transparency', 'Customer empowerment', 'Speed over perfection'],
    fieldKey: 'values',
    group: 'voice',
    hint: 'Enter one value per line. Limit to 3-6 core values for best results.',
    isRequired: false,
    questionText:
      "What are your brand's core values? List the principles that guide how your brand behaves and communicates.",
    weight: 7,
  },
  {
    answerType: 'list',
    examples: [
      'We believe AI should be a co-creator, not a replacement',
      'Simple beats complex, always',
      'Your brand voice is your competitive moat',
    ],
    fieldKey: 'messagingPillars',
    group: 'voice',
    hint: 'Enter one pillar per line. These become recurring themes in your content.',
    isRequired: false,
    questionText:
      'What are your key messaging pillars? List the core ideas or beliefs you want to communicate consistently.',
    weight: 6,
  },
  {
    answerType: 'text',
    examples: [
      '5 AI tools that doubled our content output (without the cringe)',
      'Thread: Everything we learned building our first $10k MRR, the hard way.',
    ],
    fieldKey: 'sampleOutput',
    group: 'voice',
    hint: "Paste a tweet, hook, or opening paragraph — whatever captures your brand's voice best.",
    isRequired: false,
    questionText:
      'Share a sample of your best content. Paste an example of writing that perfectly captures how your brand sounds.',
    weight: 6,
  },
  {
    answerType: 'list',
    examples: [
      'Corporate jargon and buzzwords',
      'Overly casual slang',
      'Negative or fear-based language',
    ],
    fieldKey: 'doNotSoundLike',
    group: 'voice',
    hint: 'Enter one item per line — brands, styles, or phrases to avoid.',
    isRequired: false,
    questionText:
      'What should your brand NOT sound like? List styles, tones, or examples of writing you want to avoid.',
    weight: 5,
  },

  // ── STRATEGY ──────────────────────────────────────────────────────────────
  {
    answerType: 'list',
    examples: [
      'Grow newsletter to 10k subscribers',
      'Increase LinkedIn engagement by 30%',
      'Establish thought leadership in AI tools',
    ],
    fieldKey: 'goals',
    group: 'strategy',
    hint: 'Enter one goal per line. Focus on outcomes, not activities.',
    isRequired: false,
    questionText:
      'What are your content strategy goals? List what you want your content to achieve over the next 3-6 months.',
    weight: 7,
  },
  {
    answerType: 'list',
    examples: [
      'Short-form social posts',
      'Long-form blog articles',
      'Email newsletters',
      'Video scripts',
    ],
    fieldKey: 'contentTypes',
    group: 'strategy',
    hint: 'Enter one content type per line.',
    isRequired: false,
    questionText:
      'What types of content do you create? List the formats you publish or plan to publish.',
    weight: 6,
  },
  {
    answerType: 'list',
    examples: [
      'LinkedIn',
      'X (Twitter)',
      'Instagram',
      'Newsletter (Substack)',
      'YouTube',
    ],
    fieldKey: 'platforms',
    group: 'strategy',
    hint: 'Enter one platform per line.',
    isRequired: false,
    questionText:
      'Which platforms do you publish on? List the channels where your audience finds your content.',
    weight: 6,
  },
  {
    answerType: 'text',
    examples: [
      '5 posts per week on social, 1 newsletter monthly',
      'Daily short-form, 2x weekly long-form',
    ],
    fieldKey: 'frequency',
    group: 'strategy',
    hint: 'Include both the cadence and format where relevant.',
    isRequired: false,
    questionText:
      'How often do you publish content? Describe your target publishing frequency.',
    weight: 5,
  },
];

/**
 * Ordered list of all in-scope fieldKeys in catalog order.
 * Used to determine question sequence efficiently.
 */
export const IN_SCOPE_FIELD_KEYS: string[] =
  BRAND_INTERVIEW_QUESTION_CATALOG.map((q) => q.fieldKey);

/**
 * Quick lookup: fieldKey → IBrandInterviewQuestion
 */
export const CATALOG_BY_FIELD_KEY: Record<string, IBrandInterviewQuestion> =
  Object.fromEntries(
    BRAND_INTERVIEW_QUESTION_CATALOG.map((q) => [q.fieldKey, q]),
  );

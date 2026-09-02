/**
 * Expand batch topics so each item gets a distinct generation angle.
 *
 * Empty topics caused 20 near-identical posts: every item fell back to
 * `${format} content` with the same brand voice / top-performer hooks.
 * When the agent (or API) does not pass topics, we still need N different
 * creative briefs — not N rewrites of one template.
 */

export const BATCH_TOPIC_ANGLE_TEMPLATES = [
  'Hot take / contrarian angle on {subject}',
  'Practical how-to tip for {subject}',
  'Audience question that sparks replies about {subject}',
  'Myth-busting claim about {subject}',
  'Behind-the-scenes / process insight for {subject}',
  'Short customer win or proof point tied to {subject}',
  'List-style micro-tip (3 bullets max) on {subject}',
  'Story or anecdote that lands on {subject}',
  'Data / insight or “I noticed…” observation about {subject}',
  'Challenge or dare the audience on {subject}',
  'Before/after transformation framing for {subject}',
  'Common mistake + fix for {subject}',
  'Opinionated ranking or preference about {subject}',
  'Teardown of a weak approach to {subject}',
  'Future prediction or trend call on {subject}',
  'Personal lesson learned related to {subject}',
  'Thread-opener style hook about {subject} (single post)',
  'Soft CTA to share their own take on {subject}',
  'Comparison: good vs bad examples around {subject}',
  'Urgent reminder or deadline-style nudge about {subject}',
] as const;

export type ExpandBatchTopicsInput = {
  count: number;
  formats?: Array<string | undefined>;
  platforms?: string[];
  style?: string;
  topics?: string[];
};

/**
 * Return exactly `count` topic strings. Preserves provided topics first,
 * then fills remaining slots with rotated creative angles.
 */
export function expandBatchTopics(input: ExpandBatchTopicsInput): string[] {
  const count = Math.max(0, Math.floor(input.count));
  if (count === 0) {
    return [];
  }

  const provided = (input.topics ?? [])
    .map((topic) => topic.trim())
    .filter((topic) => topic.length > 0);

  if (provided.length >= count) {
    return provided.slice(0, count);
  }

  const platforms = input.platforms?.map((p) => p.trim()).filter(Boolean) ?? [];
  const subject =
    input.style?.trim() ||
    'this brand’s product, audience pain, and differentiated POV';

  const result = [...provided];
  let fillIndex = 0;

  while (result.length < count) {
    const template =
      BATCH_TOPIC_ANGLE_TEMPLATES[
        fillIndex % BATCH_TOPIC_ANGLE_TEMPLATES.length
      ];
    const cycle =
      Math.floor(fillIndex / BATCH_TOPIC_ANGLE_TEMPLATES.length) + 1;
    const platform =
      platforms[result.length % Math.max(platforms.length, 1)] || 'social';
    const format = input.formats?.[result.length]?.trim() || 'post';
    const angle = template.replaceAll('{subject}', subject);
    const uniqueness =
      cycle > 1
        ? ` · pass ${cycle}, different hook and structure than pass ${cycle - 1}`
        : '';

    result.push(
      `${angle} · platform:${platform} · format:${format}${uniqueness}`,
    );
    fillIndex += 1;
  }

  return result;
}

/**
 * Build additionalContext lines that force the caption model to diverge
 * from posts already written in this batch.
 */
export function buildBatchDiversityContext(options: {
  index: number;
  priorCaptions: string[];
  style?: string;
  totalCount: number;
}): string[] {
  const lines: string[] = [];

  if (options.style?.trim()) {
    lines.push(options.style.trim());
  }

  lines.push(
    `Batch item ${options.index + 1} of ${options.totalCount}. Write ONE distinct post for this topic angle only. Do not reuse openers, hooks, metaphors, or sentence structures from other posts in this batch.`,
  );

  const prior = options.priorCaptions
    .map((caption) => caption.trim())
    .filter((caption) => caption.length > 0)
    .slice(-8);

  if (prior.length > 0) {
    // One string per caption. SecurityUtil.sanitizePromptInputArray caps
    // each element (300–500 chars); a joined list of 8 captions was truncated
    // mid-sentence and silently gutted diversity for later batch items.
    lines.push(
      'Already generated in this batch (do not rewrite, paraphrase, or lightly edit):',
    );
    for (const [index, caption] of prior.entries()) {
      lines.push(`${index + 1}. ${caption}`);
    }
  }

  return lines;
}

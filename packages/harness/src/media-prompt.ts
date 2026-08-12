import type { ContentHarnessBrief, ContentKind } from './types';

const VISUAL_KINDS = new Set<ContentKind>([
  'ad-creative',
  'image',
  'ugc',
  'video',
]);

/**
 * Fold a harness brief into a media/generation prompt.
 *
 * Always keeps the operator prompt first; harness is advisory context so the
 * model still follows the user's creative intent while locking brand fidelity.
 */
export function buildMediaPromptFromHarness(
  userPrompt: string,
  brief: ContentHarnessBrief | null | undefined,
  options?: { maxSourceChars?: number; maxSources?: number },
): string {
  const prompt = userPrompt.trim();
  if (!brief) {
    return prompt;
  }

  const maxSources = options?.maxSources ?? 4;
  const maxSourceChars = options?.maxSourceChars ?? 200;
  const lines: string[] = [];

  if (brief.systemDirectives.length > 0) {
    lines.push(
      'Brand system directives:',
      ...brief.systemDirectives.map((line) => `- ${line}`),
    );
  }
  if (brief.styleDirectives.length > 0) {
    lines.push(
      'Brand style directives:',
      ...brief.styleDirectives.map((line) => `- ${line}`),
    );
  }
  if (brief.guardrails.length > 0) {
    lines.push(
      'Brand guardrails:',
      ...brief.guardrails.map((line) => `- ${line}`),
    );
  }

  const exampleSources = brief.sources
    .filter(
      (source) =>
        source.kind === 'brand_example' ||
        source.kind === 'anti_example' ||
        source.kind === 'performance_winner',
    )
    .slice(0, maxSources);

  if (exampleSources.length > 0) {
    lines.push('Brand reference signals:');
    for (const source of exampleSources) {
      const content =
        source.content.length > maxSourceChars
          ? `${source.content.slice(0, maxSourceChars - 1).trimEnd()}…`
          : source.content;
      lines.push(`- [${source.kind}] ${content}`);
    }
  }

  if (lines.length === 0) {
    return prompt;
  }

  const isVisual = VISUAL_KINDS.has(brief.metadata.contentType);
  const header = isVisual
    ? 'Apply the following brand harness to visual generation. Prefer brand fidelity over generic aesthetics.'
    : 'Apply the following brand harness to generation.';

  if (!prompt) {
    return `${header}\n${lines.join('\n')}`;
  }

  return `${prompt}\n\n${header}\n${lines.join('\n')}`;
}

export function isVisualContentKind(kind: ContentKind): boolean {
  return VISUAL_KINDS.has(kind);
}

/**
 * Output contract for image and video prompt enhancement.
 *
 * The enhancement model's reply is sent to the generation model as the
 * prompt, so it must be the prompt and nothing else. Skills written for
 * interactive prompt coaching (for example `image-prompt-engineer`) describe
 * a report with a model recommendation, generation settings and notes; the
 * contract overrides that shape and `parseMediaPromptOutput` strips it if a
 * model emits it anyway.
 */

export const MEDIA_PROMPT_OUTPUT_CONTRACT = `Output contract (overrides any output format described above):
Return only the final generation prompt as plain text. No markdown, headings, labels, bullet points, quotes or commentary.
Write the prompt as flowing sentences in this order:
1. Subject and environment: core identity, age, expression, clothing, main action or object, then the setting or background.
2. Camera and composition: shot type, camera angle, lens and aperture, camera movement (video only), framing and any negative space to keep.
3. Lighting and style: lighting quality, then the medium or aesthetic.
If something should be excluded, add one final line that starts with "Negative prompt:" followed by comma-separated artifacts and defects. Omit that line when nothing needs excluding.
Never mention model names or model recommendations, aspect ratio, resolution, steps, guidance, sampler or any other generation setting, and never add notes or explanations.`;

export interface ParsedMediaPrompt {
  prompt: string;
  negativePrompt?: string;
}

const HEADING_LINE = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/;
const NEGATIVE_LINE =
  /^\s*(?:\*\*|__)?\s*negative prompt\s*(?:\*\*|__)?\s*:\s*/i;
const SETTINGS_LINE =
  /^\s*(?:[-*]\s*)?(?:\*\*|__)?\s*(?:recommended models?|aspect ratio|style preset|steps|cfg|guidance|cfg\/guidance|sampler|resolution|notes?)\b[^:\n]{0,40}(?:\*\*|__)?\s*:/i;
const EMPTY_NEGATIVE =
  /^(?:not (?:needed|required|applicable|supported)|n\/a|none|no negative prompt)\b/i;

function cleanText(value: string): string {
  return value
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanNegative(value: string): string | undefined {
  const cleaned = cleanText(value);
  return cleaned && !EMPTY_NEGATIVE.test(cleaned) ? cleaned : undefined;
}

function splitSections(raw: string): Map<string, string> | null {
  const sections = new Map<string, string[]>();
  let current = '';
  let hasHeading = false;
  for (const line of raw.split('\n')) {
    const heading = HEADING_LINE.exec(line);
    if (heading?.[1]) {
      hasHeading = true;
      current = heading[1].replace(/[*_`]/g, '').trim().toLowerCase();
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (!sections.has(current)) sections.set(current, []);
    sections.get(current)?.push(line);
  }
  return hasHeading
    ? new Map([...sections].map(([key, lines]) => [key, lines.join('\n')]))
    : null;
}

/**
 * Reduce an enhancement reply to the prompt the generation model should see
 * and, when the reply carried one, its negative prompt.
 */
export function parseMediaPromptOutput(raw: string): ParsedMediaPrompt {
  const sections = splitSections(raw);
  if (sections) {
    const promptKey = [...sections.keys()].find(
      (key) => key === 'prompt' || key === 'positive prompt',
    );
    const negativeKey = [...sections.keys()].find((key) =>
      key.startsWith('negative prompt'),
    );
    const prompt = cleanText(sections.get(promptKey ?? '') ?? '');
    if (prompt) {
      const negativePrompt = cleanNegative(
        sections.get(negativeKey ?? '') ?? '',
      );
      return { prompt, ...(negativePrompt ? { negativePrompt } : {}) };
    }
  }

  const positive: string[] = [];
  const negative: string[] = [];
  let isNegative = false;
  for (const line of raw.split('\n')) {
    const negativeMatch = NEGATIVE_LINE.exec(line);
    if (negativeMatch) {
      isNegative = true;
      negative.push(line.slice(negativeMatch[0].length));
      continue;
    }
    if (SETTINGS_LINE.test(line) || HEADING_LINE.test(line)) {
      isNegative = false;
      continue;
    }
    (isNegative ? negative : positive).push(line);
  }
  const negativePrompt = cleanNegative(negative.join('\n'));
  return {
    prompt: cleanText(positive.join('\n')),
    ...(negativePrompt ? { negativePrompt } : {}),
  };
}

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

/**
 * A video prompt describes one clip: a single action arc, one camera move and
 * one look. Over-specified prompts (lens, aperture, grain, rim light, a second
 * camera move) give the model contradictory instructions to average out. The
 * word range is our own heuristic for a clip prompt, not a provider limit.
 */
export const VIDEO_PROMPT_OUTPUT_CONTRACT = `Output contract (overrides any output format and any breadth of detail described above):
Return only the final video generation prompt as plain text. No markdown, headings, labels, bullet points, quotes or commentary.
Write 80 to 140 words of flowing sentences in this order:
1. Subject and setting: who or what is on screen and where, in plain concrete words.
2. Action over time: what happens from the first second to the last, as one continuous beat that fits the clip length.
3. Camera: one shot size and exactly one camera movement.
4. Look: one lighting line and one style line.
Stay on what the user asked for. Never introduce a different story, occupation, scenario or object that the user did not name, and never turn a brand description into a scene about hiring, devices or products the user did not mention.
When creative direction is given below, every line is binding: do not contradict it and do not add a second camera movement, lens, lighting setup or visual style.
Do not specify aperture, f-stops, film grain, brand colors, hex codes, fonts or on-screen text unless the user asked for them.
If something should be excluded, add one final line that starts with "Negative prompt:" followed by comma-separated artifacts and defects. Omit that line when nothing needs excluding.
Never mention model names or model recommendations, aspect ratio, resolution, steps, guidance, sampler or any other generation setting, and never add notes or explanations.`;

export function resolveMediaPromptOutputContract(
  contentType: 'image' | 'video',
): string {
  return contentType === 'video'
    ? VIDEO_PROMPT_OUTPUT_CONTRACT
    : MEDIA_PROMPT_OUTPUT_CONTRACT;
}

export interface MediaCreativeDirection {
  /** Labeled lines the user chose, such as `Camera movement: static`. */
  lines: readonly string[];
  /** Clip length in seconds, so the action arc fits it. */
  durationSeconds?: number;
}

/** The user's explicit picks, restated for the enhancer so the prose agrees with them. */
export function formatCreativeDirection(
  direction: MediaCreativeDirection | undefined,
): string {
  const lines = (direction?.lines ?? []).filter((line) => line.trim());
  const duration = direction?.durationSeconds;
  if (lines.length === 0 && !duration) return '';
  return [
    'Creative direction chosen by the user (binding):',
    ...lines.map((line) => `- ${line.trim()}`),
    ...(duration ? [`- Clip length: ${duration} seconds`] : []),
  ].join('\n');
}

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

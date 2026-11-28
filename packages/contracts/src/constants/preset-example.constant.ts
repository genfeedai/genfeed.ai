import type { PresetExample } from '../interfaces/elements/preset-example.interface';

/** Example media is served from the public CDN only; a signed Library URL expires. */
export const PRESET_EXAMPLE_HOST = 'cdn.genfeed.ai';
export const PRESET_EXAMPLES_MAX = 3;

const ASPECT_RATIO_PATTERN = /^[1-9]\d*:[1-9]\d*$/;
const ALT_MAX = 160;
const EXAMPLE_FIELDS = new Set([
  'alt',
  'aspectRatio',
  'mediaType',
  'posterUrl',
  'sourceUrl',
  'url',
]);

type PresetOutputType = 'image' | 'image-edit' | 'video';

function cdnUrlProblem(field: string, value: unknown): string | undefined {
  if (typeof value !== 'string') return `${field} must be a URL`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return `${field} must be a URL`;
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== PRESET_EXAMPLE_HOST ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    return `${field} must be an unsigned https://${PRESET_EXAMPLE_HOST}/ address`;
  return undefined;
}

/**
 * What is wrong with a preset's examples, in plain words; empty when they are
 * fine. An example is optional, so a new preset can land before its example.
 */
export function presetExampleProblems(
  outputType: PresetOutputType,
  examples: unknown,
): string[] {
  if (examples === undefined) return [];
  if (!Array.isArray(examples)) return ['examples must be a list'];
  if (examples.length > PRESET_EXAMPLES_MAX)
    return [`examples holds at most ${PRESET_EXAMPLES_MAX} entries`];
  const expected = outputType === 'video' ? 'video' : 'image';
  const problems: string[] = [];
  examples.forEach((example: unknown, index: number) => {
    const name = `examples[${index}]`;
    if (
      typeof example !== 'object' ||
      example === null ||
      Array.isArray(example)
    ) {
      problems.push(`${name} must be an object`);
      return;
    }
    const entry = example as Record<string, unknown>;
    for (const field of Object.keys(entry))
      if (!EXAMPLE_FIELDS.has(field))
        problems.push(`${name}.${field} is not a known field`);
    if (entry.mediaType !== expected)
      problems.push(
        `${name}.mediaType must be ${expected} on a preset that makes ${outputType}`,
      );
    if (
      typeof entry.alt !== 'string' ||
      !entry.alt.trim() ||
      entry.alt.length > ALT_MAX ||
      entry.alt.includes('\n')
    )
      problems.push(
        `${name}.alt must be one line of up to ${ALT_MAX} characters`,
      );
    if (
      typeof entry.aspectRatio !== 'string' ||
      !ASPECT_RATIO_PATTERN.test(entry.aspectRatio)
    )
      problems.push(`${name}.aspectRatio must look like 9:16`);
    const urlProblem = cdnUrlProblem(`${name}.url`, entry.url);
    if (urlProblem) problems.push(urlProblem);
    if (expected === 'video') {
      const posterProblem = cdnUrlProblem(`${name}.posterUrl`, entry.posterUrl);
      if (posterProblem) problems.push(posterProblem);
    } else if (entry.posterUrl !== undefined)
      problems.push(`${name}.posterUrl belongs to a video example`);
    if (outputType === 'image-edit') {
      const sourceProblem = cdnUrlProblem(`${name}.sourceUrl`, entry.sourceUrl);
      if (sourceProblem) problems.push(sourceProblem);
    } else if (entry.sourceUrl !== undefined)
      problems.push(`${name}.sourceUrl belongs to a photo edit example`);
  });
  return problems;
}

/** Keys of the presets that have no example yet. */
export function presetsWithoutExample(
  catalog: readonly { examples: readonly PresetExample[]; key: string }[],
): string[] {
  return catalog
    .filter((preset) => preset.examples.length === 0)
    .map((preset) => preset.key);
}

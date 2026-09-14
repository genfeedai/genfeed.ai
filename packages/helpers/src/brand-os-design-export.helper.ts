import { createHash } from 'node:crypto';
import type {
  BrandOsExportEvidence,
  IBrandOsDesignArtifact,
  IBrandOsDesignExportInput,
} from '@genfeedai/contracts/interfaces';

const SCHEMA_VERSION = '1';
const MAX_STRING = 8_000;
const MAX_ITEMS = 50;
const MAX_BYTES = 128_000;
const SECTIONS = [
  ['Identity and positioning', ['label', 'description']],
  [
    'Visual rules',
    ['primaryColor', 'secondaryColor', 'backgroundColor', 'fontFamily'],
  ],
  [
    'Voice',
    [
      'voiceTone',
      'voiceStyle',
      'voiceAudience',
      'voiceValues',
      'voiceMessagingPillars',
      'voiceDoNotSoundLike',
      'voiceSampleOutput',
    ],
  ],
  [
    'Content principles',
    [
      'strategyContentTypes',
      'strategyPlatforms',
      'strategyGoals',
      'strategyFrequency',
    ],
  ],
  [
    'Approved assets and links',
    ['logo', 'banner', 'references', 'socialLinks'],
  ],
] as const;
const ARRAY_FIELDS = new Set([
  'voiceAudience',
  'voiceValues',
  'voiceMessagingPillars',
  'voiceDoNotSoundLike',
  'strategyContentTypes',
  'strategyPlatforms',
  'strategyGoals',
]);

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function invalid(): never {
  throw new Error('Approved Brand OS cannot be exported');
}
function text(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > MAX_STRING ||
    [...value].some(
      (character) =>
        character.charCodeAt(0) < 32 && !['\t', '\n', '\r'].includes(character),
    )
  )
    return invalid();
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/https?:\/\/[^\s<>]+/gi, '[source URL omitted]')
    .replace(/[\\`*_{}[\]<>()#!|]/g, '\\$&')
    .replace(/\n/g, '\n  ');
}

/** Only explicitly public website evidence is eligible; unknown visibility defaults to omission. */
export function safeBrandOsSourceUrl(
  value: unknown,
  sourceType: unknown,
): string | undefined {
  if (
    sourceType !== 'website' ||
    typeof value !== 'string' ||
    value.length > 2_048
  )
    return undefined;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.port && url.port !== '443') ||
      !host.includes('.') ||
      /^(?:\d+\.){3}\d+$/.test(host) ||
      host.includes(':') ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/.test(
        host,
      ) ||
      /(?:token|secret|signature|credential|private|auth|invite|reset|session|download)/i.test(
        url.pathname,
      )
    )
      return undefined;
    return url.href.replace(/[()<>]/g, (character) =>
      encodeURIComponent(character),
    );
  } catch {
    return undefined;
  }
}
function classification(
  field: Record<string, unknown>,
  value: unknown,
): BrandOsExportEvidence {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && !value.length)
  )
    return 'missing';
  const evidence = Array.isArray(field.evidence)
    ? field.evidence.map(record)
    : [];
  if (
    evidence.some(
      (entry) =>
        entry?.sourceType === 'manual' ||
        entry?.sourceType === 'uploaded_guidance',
    )
  )
    return 'accepted-candidate';
  if (evidence.some((entry) => entry?.sourceType === 'system'))
    return 'inferred';
  if (
    evidence.some(
      (entry) =>
        entry?.sourceType === 'website' ||
        entry?.sourceType === 'current_brand',
    )
  )
    return 'extracted';
  return 'inferred';
}
function asset(value: unknown): string {
  const item = record(value);
  if (!item) return invalid();
  const url = safeBrandOsSourceUrl(item.url, item.sourceType);
  return url ? `<${url}>` : 'Approved reference (URL omitted)';
}
function renderValue(key: string, value: unknown): string {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && !value.length)
  )
    return 'Not provided';
  if (key === 'logo' || key === 'banner') return asset(value);
  if (key === 'references' || key === 'socialLinks') {
    if (!Array.isArray(value) || value.length > MAX_ITEMS) return invalid();
    return value.map(asset).join('; ');
  }
  if (ARRAY_FIELDS.has(key)) {
    if (!Array.isArray(value) || value.length > MAX_ITEMS) return invalid();
    return value.map(text).join('; ');
  }
  return text(value);
}

/** A fixed allowlist intentionally excludes raw captures, diagnostics, candidates and private prompt guidance. */
export function buildBrandOsDesignExport(
  input: IBrandOsDesignExportInput,
): IBrandOsDesignArtifact {
  const content = record(input.content);
  const fields = record(content?.fields);
  const approvedAt = new Date(input.approvedAt);
  if (
    !fields ||
    !Number.isFinite(approvedAt.getTime()) ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(input.brandId) ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(input.revisionId)
  )
    return invalid();
  const name = record(fields.label)?.currentValue;
  if (typeof name !== 'string' || !name.trim()) return invalid();
  const lines = [
    '# Brand design guidance',
    '',
    `Schema version: ${SCHEMA_VERSION}`,
    `Brand: ${input.brandId}`,
    `Revision: ${input.revisionId}`,
    `Generated at: ${approvedAt.toISOString()}`,
    `Visibility: ${input.visibility}`,
    '',
    'Use these approved rules for coding and content work. Evidence labels distinguish sourced facts, inferences, accepted candidates and missing guidance. Source URLs with unknown or private visibility are omitted.',
  ];
  for (const [section, keys] of SECTIONS) {
    lines.push('', `## ${section}`, '');
    for (const key of keys) {
      const field = record(fields[key]);
      if (Array.isArray(field?.evidence) && field.evidence.length > MAX_ITEMS)
        return invalid();
      const value = field?.currentValue;
      const label = classification(field ?? {}, value);
      const rendered = renderValue(key, value);
      const sources =
        field && Array.isArray(field.evidence)
          ? [
              ...new Set(
                field.evidence
                  .map((entry) => {
                    const source = record(entry);
                    return safeBrandOsSourceUrl(
                      source?.url,
                      source?.sourceType,
                    );
                  })
                  .filter((url): url is string => Boolean(url)),
              ),
            ].sort()
          : [];
      if (sources.length > MAX_ITEMS) return invalid();
      lines.push(
        `- ${key} [${label}]: ${rendered}${sources.length ? ` — Sources: ${sources.map((url) => `<${url}>`).join(', ')}` : ''}`,
      );
    }
  }
  const markdown = `${lines.join('\n')}\n`;
  if (Buffer.byteLength(markdown, 'utf8') > MAX_BYTES) return invalid();
  return {
    digest: createHash('sha256').update(markdown, 'utf8').digest('hex'),
    generatedAt: approvedAt.toISOString(),
    markdown,
    revisionId: input.revisionId,
    schemaVersion: SCHEMA_VERSION,
  };
}

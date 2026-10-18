import type {
  GenerationMediaKind,
  GenerationView,
} from '@props/admin/generations.props';

type SourceRecord = Record<string, unknown>;

const PLACEHOLDER_ASPECT_RATIO = 1;
const MIN_ASPECT_RATIO = 0.4;
const MAX_ASPECT_RATIO = 2.4;

function asRecord(value: unknown): SourceRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as SourceRecord)
    : undefined;
}

function readText(source: SourceRecord | undefined, key: string): string {
  const value = source?.[key];
  return typeof value === 'string' ? value : '';
}

function readNumber(source: SourceRecord | undefined, key: string): number {
  const value = source?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readDate(source: SourceRecord | undefined, key: string): string {
  const value = source?.[key];
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : '';
}

/** A related record arrives as an object when included and as an id when not. */
function readPerson(value: unknown): string {
  if (typeof value === 'string') return value;
  const record = asRecord(value);
  return (
    readText(record, 'email') ||
    readText(record, 'handle') ||
    readText(record, 'label') ||
    readText(record, 'id')
  );
}

function readAspectRatio(...sources: Array<SourceRecord | undefined>): number {
  for (const source of sources) {
    const width = readNumber(source, 'width');
    const height = readNumber(source, 'height');
    if (width > 0 && height > 0) {
      return Math.min(
        MAX_ASPECT_RATIO,
        Math.max(MIN_ASPECT_RATIO, width / height),
      );
    }
  }
  return PLACEHOLDER_ASPECT_RATIO;
}

function readMediaKind(category: string, url: string): GenerationMediaKind {
  if (!url) return 'none';
  switch (category.toUpperCase()) {
    case 'IMAGE':
    case 'IMAGE_EDIT':
    case 'GIF':
      return 'image';
    case 'VIDEO':
    case 'VIDEO_EDIT':
      return 'video';
    case 'MUSIC':
    case 'AUDIO':
    case 'VOICE':
      return 'audio';
    default:
      return 'image';
  }
}

/**
 * Readable lines for the brand harness the platform applied to a prompt. The
 * receipt is stored JSON, so every field is optional.
 */
export function readDirectives(harness: unknown): string[] {
  const receipt = asRecord(harness);
  if (!receipt) return [];

  const lines: string[] = [];
  const add = (label: string, value: unknown) => {
    if (typeof value === 'string' && value) lines.push(`${label}: ${value}`);
    else if (typeof value === 'number') lines.push(`${label}: ${value}`);
  };

  add('Enhancement', receipt.status);
  add('Brand mode', receipt.brandMode);
  add('Source', receipt.source);
  add('Brand', receipt.brandId);
  add('Brand revision', receipt.brandRevisionVersion);

  const packs = Array.isArray(receipt.appliedPacks) ? receipt.appliedPacks : [];
  const packLabels = packs
    .map((pack) => {
      const record = asRecord(pack);
      const id = readText(record, 'id');
      const version = readText(record, 'version');
      return id ? (version ? `${id}@${version}` : id) : '';
    })
    .filter(Boolean);
  if (packLabels.length > 0) lines.push(`Packs: ${packLabels.join(', ')}`);

  const knowledge = Array.isArray(receipt.knowledgeReceipts)
    ? receipt.knowledgeReceipts.length
    : 0;
  if (knowledge > 0) lines.push(`Knowledge sources: ${knowledge}`);

  return lines;
}

/** One ledger row from a generated ingredient (image, video or music). */
export function toGenerationView(ingredient: object): GenerationView {
  const source = ingredient as SourceRecord;
  const prompt = asRecord(source.prompt);
  const metadata = asRecord(source.metadata);
  const mediaUrl =
    readText(source, 'cdnUrl') || readText(source, 'ingredientUrl');
  const credits = source.generationCredits;

  return {
    aspectRatio: readAspectRatio(source, metadata),
    compiled: readText(source, 'generationPrompt'),
    createdAt: readDate(source, 'createdAt'),
    credits: typeof credits === 'number' ? credits : null,
    directives: readDirectives(source.generationHarness),
    enhanced: readText(prompt, 'enhanced'),
    error: readText(source, 'generationError') || readText(metadata, 'error'),
    id: readText(source, 'id'),
    kind: 'generation',
    mediaKind: readMediaKind(readText(source, 'category'), mediaUrl),
    mediaUrl,
    model: readText(source, 'modelUsed') || readText(source, 'model'),
    negative: readText(source, 'negativePrompt'),
    organizationLabel: readPerson(source.organization),
    original: readText(prompt, 'original'),
    status: readText(source, 'status'),
    userLabel: readPerson(source.user),
  };
}

/** One ledger row from a prompt that never produced media: placeholder thumbnail. */
export function toPromptView(prompt: object): GenerationView {
  const source = prompt as SourceRecord;

  return {
    aspectRatio: PLACEHOLDER_ASPECT_RATIO,
    compiled: '',
    createdAt: readDate(source, 'createdAt'),
    credits: null,
    directives: [],
    enhanced: readText(source, 'enhanced'),
    error: '',
    id: readText(source, 'id'),
    kind: 'prompt',
    mediaKind: 'none',
    mediaUrl: '',
    model: readText(source, 'model'),
    negative: '',
    organizationLabel: readPerson(source.organization),
    original: readText(source, 'original'),
    status: readText(source, 'status'),
    userLabel: readPerson(source.user),
  };
}

const CSV_HEADERS = [
  'id',
  'kind',
  'status',
  'model',
  'user',
  'organization',
  'credits',
  'created_at',
  'original',
  'enhanced',
  'compiled',
  'error',
] as const;

function escapeCsv(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  // A leading formula character is neutralized so a prompt cannot run in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** The displayed rows as CSV, for the subbar download. */
export function buildGenerationsCsv(rows: GenerationView[]): string {
  const lines = rows.map((row) =>
    [
      row.id,
      row.kind,
      row.status,
      row.model,
      row.userLabel,
      row.organizationLabel,
      row.credits,
      row.createdAt ?? '',
      row.original,
      row.enhanced,
      row.compiled,
      row.error,
    ]
      .map(escapeCsv)
      .join(','),
  );
  return [CSV_HEADERS.join(','), ...lines].join('\n');
}

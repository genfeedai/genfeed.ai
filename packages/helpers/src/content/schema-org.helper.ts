type JsonLdPrimitive = boolean | number | string | null;

export type JsonLdValue =
  | JsonLdPrimitive
  | JsonLdValue[]
  | { [key: string]: JsonLdValue | undefined };

export interface SchemaOrgPersonInput {
  name: string;
  url?: string | null;
}

export interface SchemaOrgOrganizationInput {
  logoUrl?: string | null;
  name: string;
  url?: string | null;
}

export interface ArticleJsonLdInput {
  author?: SchemaOrgOrganizationInput | SchemaOrgPersonInput | string | null;
  body?: string | null;
  dateModified?: Date | string | null;
  datePublished?: Date | string | null;
  description?: string | null;
  headline?: string | null;
  imageUrls?: Array<string | null | undefined>;
  inLanguage?: string | null;
  keywords?: Array<string | null | undefined>;
  mainEntityUrl?: string | null;
  publisher?: SchemaOrgOrganizationInput | string | null;
  url?: string | null;
  wordCount?: number | null;
}

export interface FaqJsonLdItemInput {
  answer: string;
  question: string;
}

export interface FaqJsonLdInput {
  items: FaqJsonLdItemInput[];
  name?: string | null;
  url?: string | null;
}

export interface HowToJsonLdStepInput {
  name?: string | null;
  text: string;
  url?: string | null;
}

export interface HowToJsonLdInput {
  description?: string | null;
  estimatedCost?: string | null;
  name: string;
  steps: HowToJsonLdStepInput[];
  totalTime?: string | null;
  url?: string | null;
}

export type GeneratedContentJsonLdInput =
  | ({ contentType: 'article' } & ArticleJsonLdInput)
  | ({ contentType: 'faq' } & FaqJsonLdInput)
  | ({ contentType: 'howto' } & HowToJsonLdInput);

export function buildArticleJsonLd(
  input: ArticleJsonLdInput,
): Record<string, JsonLdValue> {
  return compactJsonLdRecord({
    '@context': 'https://schema.org',
    '@type': 'Article',
    articleBody: normaliseText(input.body),
    author: input.author ? buildAuthorEntity(input.author) : undefined,
    dateModified: toIsoDate(input.dateModified),
    datePublished: toIsoDate(input.datePublished),
    description: normaliseText(input.description),
    headline: normaliseText(input.headline),
    image: normaliseStringArray(input.imageUrls),
    inLanguage: normaliseText(input.inLanguage),
    keywords: normaliseStringArray(input.keywords)?.join(', '),
    mainEntityOfPage: input.mainEntityUrl
      ? compactJsonLdRecord({
          '@id': input.mainEntityUrl,
          '@type': 'WebPage',
        })
      : undefined,
    publisher: input.publisher
      ? buildOrganizationEntity(input.publisher)
      : undefined,
    url: normaliseText(input.url),
    wordCount:
      typeof input.wordCount === 'number' && Number.isFinite(input.wordCount)
        ? Math.max(0, Math.round(input.wordCount))
        : undefined,
  });
}

export function buildFaqJsonLd(
  input: FaqJsonLdInput,
): Record<string, JsonLdValue> {
  const mainEntity = input.items
    .map((item) => ({
      answer: normaliseText(item.answer),
      question: normaliseText(item.question),
    }))
    .filter((item) => item.answer && item.question)
    .map((item) =>
      compactJsonLdRecord({
        '@type': 'Question',
        acceptedAnswer: compactJsonLdRecord({
          '@type': 'Answer',
          text: item.answer,
        }),
        name: item.question,
      }),
    );

  return compactJsonLdRecord({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity,
    name: normaliseText(input.name),
    url: normaliseText(input.url),
  });
}

export function buildHowToJsonLd(
  input: HowToJsonLdInput,
): Record<string, JsonLdValue> {
  const steps = input.steps
    .map((step) => ({
      name: normaliseText(step.name),
      text: normaliseText(step.text),
      url: normaliseText(step.url),
    }))
    .filter((step) => step.text)
    .map((step, index) =>
      compactJsonLdRecord({
        '@type': 'HowToStep',
        name: step.name ?? `Step ${index + 1}`,
        position: index + 1,
        text: step.text,
        url: step.url,
      }),
    );

  return compactJsonLdRecord({
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    description: normaliseText(input.description),
    estimatedCost: normaliseText(input.estimatedCost),
    name: normaliseText(input.name),
    step: steps,
    totalTime: normaliseText(input.totalTime),
    url: normaliseText(input.url),
  });
}

export function buildGeneratedContentJsonLd(
  input: GeneratedContentJsonLdInput,
): Record<string, JsonLdValue> {
  if (input.contentType === 'faq') {
    return buildFaqJsonLd(input);
  }

  if (input.contentType === 'howto') {
    return buildHowToJsonLd(input);
  }

  return buildArticleJsonLd(input);
}

function buildAuthorEntity(
  input: SchemaOrgOrganizationInput | SchemaOrgPersonInput | string,
): Record<string, JsonLdValue> {
  if (typeof input === 'string') {
    return compactJsonLdRecord({
      '@type': 'Person',
      name: normaliseText(input),
    });
  }

  return compactJsonLdRecord({
    '@type': 'logoUrl' in input ? 'Organization' : 'Person',
    logo:
      'logoUrl' in input && input.logoUrl
        ? compactJsonLdRecord({
            '@type': 'ImageObject',
            url: input.logoUrl,
          })
        : undefined,
    name: normaliseText(input.name),
    url: normaliseText(input.url),
  });
}

function buildOrganizationEntity(
  input: SchemaOrgOrganizationInput | string,
): Record<string, JsonLdValue> {
  if (typeof input === 'string') {
    return compactJsonLdRecord({
      '@type': 'Organization',
      name: normaliseText(input),
    });
  }

  return compactJsonLdRecord({
    '@type': 'Organization',
    logo: input.logoUrl
      ? compactJsonLdRecord({
          '@type': 'ImageObject',
          url: input.logoUrl,
        })
      : undefined,
    name: normaliseText(input.name),
    url: normaliseText(input.url),
  });
}

function compactJsonLdRecord(
  value: Record<string, JsonLdValue | undefined>,
): Record<string, JsonLdValue> {
  const result: Record<string, JsonLdValue> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) {
      continue;
    }

    if (Array.isArray(entry) && entry.length === 0) {
      continue;
    }

    if (typeof entry === 'string' && entry.trim().length === 0) {
      continue;
    }

    result[key] = entry;
  }

  return result;
}

function normaliseText(value?: string | null): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normaliseStringArray(
  value?: Array<string | null | undefined>,
): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((item) => normaliseText(item))
    .filter((item): item is string => Boolean(item));
  return items.length > 0 ? items : undefined;
}

function toIsoDate(value?: Date | string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export interface GeneratedContentAttributes {
  body: unknown;
  content: unknown;
  cta: unknown;
  hashtags: unknown;
  hook: unknown;
  patternId: unknown;
  patternUsed: unknown;
}

export interface GeneratedContentResource {
  attributes: GeneratedContentAttributes;
  id: string;
  type: 'generated-content';
}

export interface GeneratedContentCollection {
  data: GeneratedContentResource[];
  meta: {
    limit: number;
    page: number;
    totalDocs: number;
    totalPages: number;
  };
}

type GeneratedContentInput = {
  body?: unknown;
  content?: unknown;
  cta?: unknown;
  hashtags?: unknown;
  hook?: unknown;
  patternId?: unknown;
  patternUsed?: unknown;
};

function isGeneratedContentInput(
  value: unknown,
): value is GeneratedContentInput {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Generated content is a request-scoped projection, not a Prisma row.
 * The generate endpoint returns a hand-rolled `{ data, meta }` collection;
 * `buildSerializer` would change that envelope.
 */
export const GeneratedContentSerializer = {
  serialize(data: unknown, index = 0): GeneratedContentResource | null {
    if (!data || !isGeneratedContentInput(data)) {
      return null;
    }

    return {
      attributes: {
        body: data.body,
        content: data.content,
        cta: data.cta,
        hashtags: data.hashtags,
        hook: data.hook,
        patternId: data.patternId,
        patternUsed: data.patternUsed,
      },
      id: `generated-${index}`,
      type: 'generated-content',
    };
  },

  serializeCollection(results: readonly unknown[]): GeneratedContentCollection {
    const data = results.flatMap((result, index) => {
      const resource = GeneratedContentSerializer.serialize(result, index);
      return resource ? [resource] : [];
    });

    return {
      data,
      meta: {
        limit: results.length,
        page: 1,
        totalDocs: results.length,
        totalPages: 1,
      },
    };
  },
};

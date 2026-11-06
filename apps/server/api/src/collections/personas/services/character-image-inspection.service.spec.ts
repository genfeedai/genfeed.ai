import { CharacterImageInspectionService } from '@api/collections/personas/services/character-image-inspection.service';
import { ValidationException } from '@api/exceptions/validation.exception';
import type { CacheService } from '@api/services/cache/cache.service';
import type { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

interface Image {
  brandId: string;
  category: IngredientCategory;
  cdnUrl: string | null;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  personaId: string | null;
  status: IngredientStatus;
  updatedAt: Date;
}

interface Persona {
  avatarIngredientId: string | null;
  brandId: string;
  handle: string;
  id: string;
  isDeleted: boolean;
  label: string;
  organizationId: string;
  referenceIngredientIds: string[];
}

type PersonaMatch =
  | { avatarIngredientId: string }
  | { id: string }
  | { references: { some: { ingredientId: string } } };

const IMAGE_URL = 'https://cdn.example.com/image.png';
const updatedAt = new Date('2026-09-08T12:00:00Z');

// Matches a column against an equality or `{ in: [...] }` filter.
const matchesColumn = (value: unknown, filter: unknown) =>
  typeof filter === 'object' && filter !== null && 'in' in filter
    ? (filter.in as unknown[]).includes(value)
    : value === filter;

const matchesPersona = (persona: Persona, match: PersonaMatch) =>
  'references' in match
    ? persona.referenceIngredientIds.includes(
        match.references.some.ingredientId,
      )
    : Object.entries(match).every(
        ([key, value]) => persona[key as keyof Persona] === value,
      );

describe('CharacterImageInspectionService', () => {
  let cache: Map<string, unknown>;
  let images: Image[];
  let personas: Persona[];
  let visionAnswers: Map<string, string>;
  let seenByVision: string[];
  let service: CharacterImageInspectionService;

  const image = (fields: Partial<Image> = {}): Image => ({
    brandId: 'brand-1',
    category: IngredientCategory.IMAGE,
    cdnUrl: IMAGE_URL,
    id: 'image-1',
    isDeleted: false,
    organizationId: 'org-1',
    personaId: null,
    status: IngredientStatus.GENERATED,
    updatedAt,
    ...fields,
  });

  const persona = (fields: Partial<Persona> = {}): Persona => ({
    avatarIngredientId: null,
    brandId: 'brand-1',
    handle: 'anna',
    id: 'character-1',
    isDeleted: false,
    label: 'Anna',
    organizationId: 'org-1',
    referenceIngredientIds: [],
    ...fields,
  });

  const inspect = (assetId = 'image-1') =>
    service.inspect(assetId, 'org-1', 'brand-1');

  beforeEach(() => {
    cache = new Map();
    images = [];
    personas = [];
    seenByVision = [];
    visionAnswers = new Map([
      [IMAGE_URL, '{"hasFace":true,"isCharacter":true}'],
    ]);

    const prisma = {
      ingredient: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) =>
          images.find((row) =>
            Object.entries(where).every(([key, filter]) =>
              matchesColumn(row[key as keyof Image], filter),
            ),
          ) ?? null,
      },
      persona: {
        findFirst: async ({
          where: { OR, ...columns },
        }: {
          where: Record<string, unknown> & { OR: PersonaMatch[] };
        }) =>
          personas.find(
            (row) =>
              Object.entries(columns).every(
                ([key, value]) => row[key as keyof Persona] === value,
              ) && OR.some((match) => matchesPersona(row, match)),
          ) ?? null,
      },
    } as unknown as PrismaService;
    const cacheService = {
      getOrSetWithLock: async (key: string, load: () => Promise<unknown>) => {
        if (!cache.has(key)) {
          cache.set(key, await load());
        }
        return cache.get(key);
      },
    } as unknown as CacheService;
    // A vision model that answers per image URL; an unknown URL is an outage.
    const vision = {
      chatCompletion: async (request: {
        messages: [unknown, { content: [{ image_url: { url: string } }] }];
      }) => {
        const url = request.messages[1].content[0].image_url.url;
        seenByVision.push(url);
        const content = visionAnswers.get(url);
        if (content === undefined) {
          throw new Error('unavailable');
        }
        return { choices: [{ message: { content } }] };
      },
    } as unknown as OpenRouterService;

    service = new CharacterImageInspectionService(prisma, cacheService, vision);
  });

  it('classifies a finished brand image from its pixels', async () => {
    images.push(image());

    await expect(inspect()).resolves.toEqual({
      characterId: null,
      handle: null,
      hasFace: true,
      id: 'image-1',
      isCharacter: true,
      label: null,
    });
    expect(seenByVision).toEqual([IMAGE_URL]);
  });

  it.each([
    ['another brand', image({ brandId: 'brand-2' })],
    ['another organization', image({ organizationId: 'org-2' })],
    ['a deleted image', image({ isDeleted: true })],
    ['a video', image({ category: IngredientCategory.VIDEO })],
    ['an unfinished image', image({ status: IngredientStatus.PROCESSING })],
  ])('refuses %s before inference', async (_case, row) => {
    images.push(row);

    await expect(inspect()).rejects.toBeInstanceOf(ValidationException);
    expect(seenByVision).toEqual([]);
  });

  it.each([
    ['its avatar', image(), persona({ avatarIngredientId: 'image-1' })],
    [
      'one of its references',
      image(),
      persona({ referenceIngredientIds: ['image-1'] }),
    ],
    ['its generated image', image({ personaId: 'character-1' }), persona()],
  ])(
    'recognizes a saved character by %s without inference',
    async (_case, row, saved) => {
      images.push(row);
      personas.push(saved);

      await expect(inspect()).resolves.toMatchObject({
        characterId: 'character-1',
        handle: 'anna',
        hasFace: null,
        isCharacter: null,
        label: 'Anna',
      });
      expect(seenByVision).toEqual([]);
    },
  );

  it('ignores a character of another brand using the same image', async () => {
    images.push(image());
    personas.push(
      persona({ avatarIngredientId: 'image-1', brandId: 'brand-2' }),
    );

    await expect(inspect()).resolves.toMatchObject({
      characterId: null,
      isCharacter: true,
    });
  });

  it.each([
    [false, true],
    [true, false],
    [false, false],
  ])(
    'keeps face=%s and character=%s independent',
    async (hasFace, isCharacter) => {
      images.push(image());
      visionAnswers.set(IMAGE_URL, JSON.stringify({ hasFace, isCharacter }));

      await expect(inspect()).resolves.toMatchObject({ hasFace, isCharacter });
    },
  );

  it('reuses the classification of an unchanged image', async () => {
    images.push(image());
    await inspect();

    await expect(inspect()).resolves.toMatchObject({
      hasFace: true,
      isCharacter: true,
    });
    expect(seenByVision).toEqual([IMAGE_URL]);
    expect([...cache.keys()]).toEqual([
      'character-image:v1:org-1:brand-1:image-1:2026-09-08T12:00:00.000Z',
    ]);
  });

  it('rechecks saved characters before answering from the cache', async () => {
    images.push(image());
    await inspect();
    personas.push(persona({ avatarIngredientId: 'image-1' }));

    await expect(inspect()).resolves.toMatchObject({
      characterId: 'character-1',
      hasFace: null,
    });
  });

  it.each<[string, [string, string][]]>([
    ['the vision service is down', []],
    ['the answer is not JSON', [[IMAGE_URL, 'invalid JSON']]],
    [
      'a field is not boolean',
      [[IMAGE_URL, '{"hasFace":"yes","isCharacter":true}']],
    ],
  ])('answers unknown when %s', async (_case, answers) => {
    images.push(image());
    visionAnswers = new Map(answers);

    await expect(inspect()).resolves.toMatchObject({
      characterId: null,
      hasFace: null,
      isCharacter: null,
    });
    expect(cache.size).toBe(0);
  });

  it.each([
    ['a local URL', 'http://localhost/image.png'],
    ['no URL', null],
  ])('keeps %s away from the vision service', async (_case, cdnUrl) => {
    images.push(image({ cdnUrl }));

    await expect(inspect()).resolves.toMatchObject({
      hasFace: null,
      isCharacter: null,
    });
    expect(seenByVision).toEqual([]);
  });
});

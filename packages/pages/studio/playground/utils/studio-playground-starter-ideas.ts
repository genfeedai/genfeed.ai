import { ReferenceImageCategory } from '@genfeedai/contracts';
import type {
  StudioPlaygroundReferenceRole,
  StudioPlaygroundType,
} from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import {
  type BrandOfferingKind,
  classifyBrandOffering,
} from '@genfeedai/helpers/brand/brand-offering.helper';
import type {
  StudioPlaygroundStarterCharacter,
  StudioPlaygroundStarterCharacterCandidate,
  StudioPlaygroundStarterIdea,
  StudioPlaygroundStarterProductReference,
} from '@genfeedai/props/studio/studio-playground.props';
import { isObjectLike } from '@genfeedai/utils/data/extract.util';
import { cdnAsset } from '@helpers/media/cdn/cdn.helper';
import type { JSONContent } from '@tiptap/core';

const STARTER_THUMBNAIL_FILES: Record<
  StudioPlaygroundStarterIdea['id'],
  string
> = {
  avatarIntro: 'avatar-intro',
  cinematicVideo: 'cinematic-video',
  productAd: 'product-ad',
  productPhoto: 'product-photo',
  soundtrack: 'soundtrack',
  voiceover: 'voiceover',
};

function starterThumbnail(id: StudioPlaygroundStarterIdea['id']): string {
  return cdnAsset(
    `/assets/starters/playground/${STARTER_THUMBNAIL_FILES[id]}.webp`,
  );
}

/**
 * One known-good first generation per content job Studio can run.
 * Product ideas swap to the influencer template when a character is tagged.
 * A cinematic idea keeps its own template and still tags the character.
 */
export const STUDIO_PLAYGROUND_STARTER_IDEAS: readonly StudioPlaygroundStarterIdea[] =
  [
    {
      aspectRatio: '1:1',
      characterPromptTemplate: 'influencer-photo',
      id: 'productPhoto',
      promptTemplate: 'product-photo',
      thumbnailUrl: starterThumbnail('productPhoto'),
      type: 'image',
      usesCharacter: true,
      usesProductReference: true,
    },
    {
      aspectRatio: '9:16',
      characterPromptTemplate: 'influencer-video',
      id: 'productAd',
      promptTemplate: 'product-ad-video',
      thumbnailUrl: starterThumbnail('productAd'),
      type: 'video',
      usesCharacter: true,
      usesProductReference: true,
    },
    {
      aspectRatio: '16:9',
      id: 'cinematicVideo',
      promptTemplate: 'cinematic-video',
      thumbnailUrl: starterThumbnail('cinematicVideo'),
      type: 'video',
      usesCharacter: true,
      usesProductReference: false,
    },
    {
      id: 'soundtrack',
      instrumental: true,
      thumbnailUrl: starterThumbnail('soundtrack'),
      type: 'music',
      usesCharacter: false,
      usesProductReference: false,
    },
    {
      id: 'avatarIntro',
      thumbnailUrl: starterThumbnail('avatarIntro'),
      type: 'avatar',
      usesCharacter: false,
      usesProductReference: false,
    },
    {
      id: 'voiceover',
      thumbnailUrl: starterThumbnail('voiceover'),
      type: 'voice',
      usesCharacter: false,
      usesProductReference: false,
    },
  ];

const SOFTWARE_STARTER_IDEAS = new Set([
  'productAd',
  'productPhoto',
  'voiceover',
]);

export function starterOfferingKind(
  brand:
    | {
        agentConfig?: {
          strategy?: { offers?: readonly string[]; topics?: readonly string[] };
          voice?: { audience?: readonly string[] };
        } | null;
        description?: string | null;
        text?: string | null;
      }
    | null
    | undefined,
): BrandOfferingKind {
  return classifyBrandOffering(
    [
      brand?.description,
      brand?.text,
      ...(brand?.agentConfig?.strategy?.offers ?? []),
      ...(brand?.agentConfig?.strategy?.topics ?? []),
      ...(brand?.agentConfig?.voice?.audience ?? []),
    ]
      .filter((value): value is string => typeof value === 'string')
      .join('\n'),
  );
}

export function starterIdeaUsesSoftwareCopy(
  ideaId: string,
  offeringKind: BrandOfferingKind | undefined,
): boolean {
  return offeringKind === 'software' && SOFTWARE_STARTER_IDEAS.has(ideaId);
}

/** Prefer a character that can become a reference image on submit. */
export function pickStarterCharacter(
  mentions: readonly StudioPlaygroundStarterCharacterCandidate[],
): StudioPlaygroundStarterCharacter | undefined {
  const match = mentions.find((item) => item.hasReferenceImage) ?? mentions[0];
  if (!match) {
    return undefined;
  }

  return {
    handle: match.handle,
    id: match.id,
    label: match.label,
  };
}

function readTrimmedField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * First brand-kit still whose category is PRODUCT.
 * Face references sort ahead of products, and a logo id does not resolve
 * as a generation reference.
 */
export function pickStarterProductReference(
  references: readonly unknown[] | undefined,
): StudioPlaygroundStarterProductReference | undefined {
  if (!references) {
    return undefined;
  }

  for (const item of references) {
    if (!isObjectLike(item)) {
      continue;
    }
    const id = readTrimmedField(item, 'id');
    const previewUrl = readTrimmedField(item, 'cdnUrl');
    const category = readTrimmedField(item, 'referenceCategory');
    if (!id || !previewUrl || category !== ReferenceImageCategory.PRODUCT) {
      continue;
    }

    const label = readTrimmedField(item, 'displayName');
    return {
      id,
      ...(label ? { label } : {}),
      previewUrl,
    };
  }

  return undefined;
}

/** Product photo stays a reference. A product ad opens on that still. */
export function starterProductReferenceRole(
  type: StudioPlaygroundType,
): StudioPlaygroundReferenceRole {
  return type === 'video' ? 'startFrame' : 'reference';
}

export function starterIdeaPromptTemplate(
  idea: StudioPlaygroundStarterIdea,
  hasCharacter: boolean,
): string | undefined {
  if (hasCharacter && idea.usesCharacter && idea.characterPromptTemplate) {
    return idea.characterPromptTemplate;
  }
  return idea.promptTemplate;
}

/**
 * Plain sentence, or a sentence with one `characterMention` atom between
 * the lead and the tail. The atom is the same node `@` inserts in Studio.
 */
export function buildStarterIdeaDocument(
  lead: string,
  tail: string | undefined,
  character: StudioPlaygroundStarterCharacter | undefined,
): JSONContent {
  const content: JSONContent[] = [{ text: lead, type: 'text' }];
  if (character) {
    content.push({
      attrs: {
        handle: character.handle,
        id: character.id,
        label: character.label,
      },
      type: 'characterMention',
    });
    if (tail) {
      content.push({ text: tail, type: 'text' });
    }
  }

  return {
    content: [{ content, type: 'paragraph' }],
    type: 'doc',
  };
}

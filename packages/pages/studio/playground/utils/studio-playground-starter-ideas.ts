import { ReferenceImageCategory } from '@genfeedai/contracts';
import type {
  StudioPlaygroundReferenceRole,
  StudioPlaygroundType,
} from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import type {
  StudioPlaygroundStarterCharacter,
  StudioPlaygroundStarterCharacterCandidate,
  StudioPlaygroundStarterIdea,
  StudioPlaygroundStarterProductReference,
} from '@genfeedai/props/studio/studio-playground.props';
import { isObjectLike } from '@genfeedai/utils/data/extract.util';
import type { JSONContent } from '@tiptap/core';

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
      type: 'image',
      usesCharacter: true,
      usesProductReference: true,
    },
    {
      aspectRatio: '9:16',
      characterPromptTemplate: 'influencer-video',
      id: 'productAd',
      promptTemplate: 'product-ad-video',
      type: 'video',
      usesCharacter: true,
      usesProductReference: true,
    },
    {
      aspectRatio: '16:9',
      id: 'cinematicVideo',
      promptTemplate: 'cinematic-video',
      type: 'video',
      usesCharacter: true,
      usesProductReference: false,
    },
    {
      id: 'soundtrack',
      instrumental: true,
      type: 'music',
      usesCharacter: false,
      usesProductReference: false,
    },
    {
      id: 'avatarIntro',
      type: 'avatar',
      usesCharacter: false,
      usesProductReference: false,
    },
    {
      id: 'voiceover',
      type: 'voice',
      usesCharacter: false,
      usesProductReference: false,
    },
  ];

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

import type {
  StudioGenerateStarterCharacter,
  StudioGenerateStarterCharacterCandidate,
  StudioGenerateStarterIdea,
} from '@genfeedai/props/studio/studio-generate.props';
import type { JSONContent } from '@tiptap/core';

/**
 * One known-good first generation per content job Studio can run.
 * Product ideas swap to the influencer template when a character is tagged.
 * A cinematic idea keeps its own template and still tags the character.
 */
export const STUDIO_GENERATE_STARTER_IDEAS: readonly StudioGenerateStarterIdea[] =
  [
    {
      aspectRatio: '1:1',
      characterPromptTemplate: 'influencer-photo',
      id: 'productPhoto',
      promptTemplate: 'product-photo',
      type: 'image',
      usesCharacter: true,
    },
    {
      aspectRatio: '9:16',
      characterPromptTemplate: 'influencer-video',
      id: 'productAd',
      promptTemplate: 'product-ad-video',
      type: 'video',
      usesCharacter: true,
    },
    {
      aspectRatio: '16:9',
      id: 'cinematicVideo',
      promptTemplate: 'cinematic-video',
      type: 'video',
      usesCharacter: true,
    },
    {
      id: 'soundtrack',
      instrumental: true,
      type: 'music',
      usesCharacter: false,
    },
    {
      id: 'avatarIntro',
      type: 'avatar',
      usesCharacter: false,
    },
    {
      id: 'voiceover',
      type: 'voice',
      usesCharacter: false,
    },
  ];

/** Prefer a character that can become a reference image on submit. */
export function pickStarterCharacter(
  mentions: readonly StudioGenerateStarterCharacterCandidate[],
): StudioGenerateStarterCharacter | undefined {
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

export function starterIdeaPromptTemplate(
  idea: StudioGenerateStarterIdea,
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
  character: StudioGenerateStarterCharacter | undefined,
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

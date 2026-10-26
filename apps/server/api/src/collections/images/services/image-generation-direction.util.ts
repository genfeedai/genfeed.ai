import { omitMentionedText } from '@api/services/generation-brief/omit-mentioned-text.util';

/** The Studio picks that steer a still, as the request carries them. */
export interface ImageDirectionInput {
  action?: string;
  camera?: string;
  lens?: string;
  mood?: string;
  style?: string;
  subject?: string;
}

/** Brief fields a compiler appends after the objective. */
export interface ImageBriefDirection {
  composition: string;
  subjects?: string[];
  visualDirection?: string;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * The subject (with what it does) and the look the person picked, minus
 * whatever the objective already says in its own words.
 */
export function buildImageBriefDirection(
  input: ImageDirectionInput,
  objective: string,
): ImageBriefDirection {
  const subject = omitMentionedText(objective, [input.subject, input.action])
    .join(' ')
    .trim();
  const mood = omitMentionedText(objective, [input.mood])[0];
  const visualDirection = [
    clean(input.style),
    mood ? `${mood} mood` : undefined,
  ]
    .filter((part): part is string => !!part)
    .join(', ');

  const composition = [clean(input.camera), clean(input.lens)]
    .filter((part): part is string => !!part)
    .join(', ');

  return {
    composition,
    ...(subject ? { subjects: [subject] } : {}),
    ...(visualDirection ? { visualDirection } : {}),
  };
}

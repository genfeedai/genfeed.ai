/**
 * Pseudo-localization for the `en-XA` locale (epic #2497).
 *
 * `en-XA` is derived from the `en` catalog at load time rather than being a
 * committed set of files, so it can never drift from English. It exists to
 * make two classes of defect visible before a real translation exists:
 *
 * - a hardcoded string, which stays plain ASCII while everything around it is
 *   accented and bracketed;
 * - a layout that breaks on longer copy, which the padding forces.
 */

const ACCENTS: Readonly<Record<string, string>> = {
  a: 'á',
  A: 'Å',
  b: 'ƀ',
  B: 'Ɓ',
  c: 'ç',
  C: 'Ç',
  d: 'ð',
  D: 'Ð',
  e: 'é',
  E: 'É',
  f: 'ƒ',
  F: 'Ƒ',
  g: 'ĝ',
  G: 'Ĝ',
  h: 'ĥ',
  H: 'Ĥ',
  i: 'í',
  I: 'Í',
  j: 'ĵ',
  J: 'Ĵ',
  k: 'ķ',
  K: 'Ķ',
  l: 'ĺ',
  L: 'Ĺ',
  m: 'ṁ',
  M: 'Ṁ',
  n: 'ñ',
  N: 'Ñ',
  o: 'ö',
  O: 'Ö',
  p: 'þ',
  P: 'Þ',
  r: 'ŕ',
  R: 'Ŕ',
  s: 'š',
  S: 'Š',
  t: 'ţ',
  T: 'Ţ',
  u: 'ú',
  U: 'Ú',
  w: 'ŵ',
  W: 'Ŵ',
  y: 'ý',
  Y: 'Ý',
  z: 'ž',
  Z: 'Ž',
};

/** Roughly the expansion German or Finnish inflicts on English source copy. */
const EXPANSION_RATIO = 0.3;

const PADDING_CHARACTER = '·';

/**
 * Accent the visible characters of one message.
 *
 * Anything inside `{...}` is left byte-for-byte alone: that covers plain
 * placeholders (`{name}`) and whole ICU constructs (`{count, plural, ...}`).
 * The nested text of a plural or select arm therefore stays un-accented, which
 * is the deliberate trade — corrupting ICU is far worse than under-marking a
 * fragment. Markup tags used by next-intl rich text (`<b>…</b>`) are skipped
 * for the same reason.
 */
export function pseudoLocalizeMessage(message: string): string {
  let depth = 0;
  let isInsideTag = false;
  let accented = '';

  for (const character of message) {
    if (character === '{') {
      depth += 1;
      accented += character;
      continue;
    }

    if (character === '}') {
      depth = Math.max(0, depth - 1);
      accented += character;
      continue;
    }

    if (character === '<') {
      isInsideTag = true;
      accented += character;
      continue;
    }

    if (character === '>') {
      isInsideTag = false;
      accented += character;
      continue;
    }

    const isVerbatim = depth > 0 || isInsideTag;
    accented += isVerbatim ? character : (ACCENTS[character] ?? character);
  }

  const padding = PADDING_CHARACTER.repeat(
    Math.ceil(message.length * EXPANSION_RATIO),
  );

  return `[!!${accented}${padding}!!]`;
}

type MessageTree = { [key: string]: MessageTree | string };

/** Walk a catalog and pseudo-localize every leaf string. */
export function pseudoLocalizeMessages<TMessages extends MessageTree>(
  messages: TMessages,
): TMessages {
  const pseudo: MessageTree = {};

  for (const [key, value] of Object.entries(messages)) {
    pseudo[key] =
      typeof value === 'string'
        ? pseudoLocalizeMessage(value)
        : pseudoLocalizeMessages(value);
  }

  return pseudo as TMessages;
}

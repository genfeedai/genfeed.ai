export interface MentionablePerson {
  name: string;
  userId: string;
}

const TRAILING_MENTION_PATTERN = /@(\w*)$/;
const MENTION_SPLIT_PATTERN = /(@\w+)/g;
const WHITESPACE_PATTERN = /\s+/;

/**
 * The text that stands for a teammate in a message: `@Marco`, or `@MarcoRossi`
 * when another teammate shares the first name. The server stores the user id,
 * never this text.
 */
export function mentionToken(
  person: MentionablePerson,
  everyone: readonly MentionablePerson[],
): string {
  const [first = person.name] = person.name.trim().split(WHITESPACE_PATTERN);
  const isFirstNameShared = everyone.some(
    (other) =>
      other.userId !== person.userId &&
      other.name.trim().split(WHITESPACE_PATTERN)[0]?.toLowerCase() ===
        first.toLowerCase(),
  );
  const token = isFirstNameShared ? person.name.replace(/\s+/g, '') : first;
  return `@${token}`;
}

/** What the author has typed after the last `@`, or null when not mentioning. */
export function activeMentionQuery(text: string): string | null {
  const match = TRAILING_MENTION_PATTERN.exec(text);
  return match ? (match[1] ?? '') : null;
}

/** Teammates whose name starts with what was typed after the `@`. */
export function matchMentionable<T extends MentionablePerson>(
  people: readonly T[],
  query: string,
): T[] {
  const needle = query.toLowerCase();
  return people.filter((person) =>
    person.name
      .toLowerCase()
      .split(WHITESPACE_PATTERN)
      .some((part) => part.startsWith(needle)),
  );
}

/** Replaces the `@query` being typed with the chosen teammate's token. */
export function insertMention(text: string, token: string): string {
  return text.replace(TRAILING_MENTION_PATTERN, `${token} `);
}

/**
 * The user ids to send: the teammates picked from the list whose token is
 * still in the text, so deleting a tag also drops the mention.
 */
export function mentionedUserIds(
  text: string,
  picked: ReadonlyMap<string, string>,
): string[] {
  const tokens = new Set(
    (text.match(MENTION_SPLIT_PATTERN) ?? []).map((token) =>
      token.toLowerCase(),
    ),
  );
  return [...picked]
    .filter(([, token]) => tokens.has(token.toLowerCase()))
    .map(([userId]) => userId);
}

/** The message text cut into plain parts and `@tag` parts for display. */
export function splitMentions(
  text: string,
): Array<{ isMention: boolean; text: string }> {
  return text
    .split(MENTION_SPLIT_PATTERN)
    .filter((part) => part !== '')
    .map((part) => ({ isMention: part.startsWith('@'), text: part }));
}

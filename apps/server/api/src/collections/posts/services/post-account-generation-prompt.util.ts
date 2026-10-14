import { isValidPostLength } from '@api/collections/posts/services/post-generation-text.util';
import type { AccountPublishingContext } from '@genfeedai/contracts/interfaces';

const RUN_CONTEXT_MARKER = 'Already written in this run';
const MAX_CONTEXT_ENTRIES = 12;
const MAX_CONTEXT_ENTRY_CHARACTERS = 280;

interface AccountPromptInput {
  context: Pick<AccountPublishingContext, 'constraints' | 'promptHints'> & {
    account: Pick<AccountPublishingContext['account'], 'platform'>;
  };
  count: number;
  limit: number;
  tone: string;
  topic: string;
}

function publishingContextLines(
  context: Pick<AccountPublishingContext, 'constraints' | 'promptHints'>,
): string[] {
  return [
    '',
    'Account publishing context:',
    ...context.promptHints.map((hint) => `- ${hint}`),
    ...context.constraints.notes.map((note) => `- ${note}`),
    '',
    'Do not repeat recent account posts. Keep the output tailored to this selected account.',
  ];
}

/** One standalone post: the prompt of dispatch `index` out of `count`. */
export function buildAccountPostPrompt(
  input: AccountPromptInput & { index: number },
): string {
  const { account } = input.context;
  return [
    `Write one ${account.platform} post for the selected account, at most ${input.limit} characters.`,
    `This is post ${input.index + 1} of ${input.count}; take a distinct angle on the topic.`,
    `Topic: ${input.topic}`,
    `Tone: ${input.tone}`,
    'Return only the finished post text, without numbering, explanations or quotation marks.',
    ...publishingContextLines(input.context),
  ].join('\n');
}

/** A whole thread in one dispatch: one receipt binds all of its posts. */
export function buildAccountThreadPrompt(input: AccountPromptInput): string {
  const { account } = input.context;
  return [
    `Write one ${account.platform} thread of exactly ${input.count} posts for the selected account.`,
    `Each post must be at most ${input.limit} characters and build on the previous one.`,
    `Topic: ${input.topic}`,
    `Tone: ${input.tone}`,
    'Separate the posts with one blank line. Return only the posts, without numbering, explanations or quotation marks.',
    ...publishingContextLines(input.context),
  ].join('\n');
}

/** What the run already wrote, so later dispatches do not repeat it. */
export function withRunContext(prompt: string, previous: string[]): string {
  const recent = previous
    .slice(-MAX_CONTEXT_ENTRIES)
    .map((text) => text.slice(0, MAX_CONTEXT_ENTRY_CHARACTERS));
  if (recent.length === 0) return prompt;
  return [
    prompt,
    '',
    `${RUN_CONTEXT_MARKER} (do not repeat their wording or angle):`,
    ...recent.map((text) => `- ${JSON.stringify(text)}`),
  ].join('\n');
}

/** The thread's posts: blank-line separated, as the thread prompt asks. */
export function splitThreadText(text: string): string[] {
  return text
    .split(/\n{2,}/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Channel-limit gate of one dispatch; a thread must return exactly its posts. */
export function acceptsAccountText(
  text: string,
  options: {
    count: number;
    isThread: boolean;
    limit: number;
    usesWeightedCharacters: boolean;
  },
): boolean {
  const parts = options.isThread ? splitThreadText(text) : [text];
  return (
    parts.length === (options.isThread ? options.count : 1) &&
    parts.every((part) =>
      isValidPostLength(part, options.limit, options.usesWeightedCharacters),
    )
  );
}

import { GenfeedError } from '@/utils/errors';

export interface ParsedSlashCommand {
  args: string[];
  name: string;
}

function tokenize(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;

  for (const character of value) {
    if (quote) {
      if (character === quote) {
        quote = undefined;
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
    } else if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += character;
    }
  }

  if (quote) {
    throw new GenfeedError('Unterminated quote in slash command');
  }
  if (current) tokens.push(current);
  return tokens;
}

export function parseSlashCommand(input: string): ParsedSlashCommand {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    throw new GenfeedError('TUI slash commands must start with /');
  }

  const [name, ...args] = tokenize(trimmed.slice(1));
  if (!name) {
    throw new GenfeedError('Enter a command after /');
  }
  return { args, name: name.toLocaleLowerCase() };
}

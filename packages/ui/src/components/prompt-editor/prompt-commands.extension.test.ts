import type { PromptCommand } from '@genfeedai/props/prompt-bars/prompt-command.props';
import { describe, expect, it, vi } from 'vitest';

import {
  filterPromptCommands,
  insertPromptCommandText,
  promptCommandText,
} from './prompt-commands.extension';

const COMMANDS: PromptCommand[] = [
  {
    actionName: 'create',
    description: 'New content in Studio',
    kind: 'action',
    label: 'Create',
    name: 'create',
  },
  {
    description: 'Get grilled on your brand voice',
    kind: 'skill',
    label: 'Interview',
    name: 'interview',
    promptPrefix: 'Start the brand interview.',
    skillSlug: 'brand-interview',
  },
  {
    description: 'Craft optimized prompts for AI image generation',
    kind: 'skill',
    label: 'Image Prompt Engineer',
    name: 'image-prompt-engineer',
    skillSlug: 'image-prompt-engineer',
  },
  {
    description: 'Write a caption',
    kind: 'prompt',
    label: 'Caption',
    name: 'caption',
    promptPrefix: 'Write a caption for ',
  },
];

describe('promptCommandText', () => {
  it('inserts an action as its dispatchable action name', () => {
    expect(promptCommandText(COMMANDS[0])).toBe('/create ');
  });

  it('inserts a skill as its slug, not its display name', () => {
    expect(promptCommandText(COMMANDS[1])).toBe(
      '/brand-interview Start the brand interview.',
    );
  });

  it('inserts a skill with no seeded prompt as a bare token', () => {
    expect(promptCommandText(COMMANDS[2])).toBe('/image-prompt-engineer ');
  });

  it('inserts a prompt command as its prefix', () => {
    expect(promptCommandText(COMMANDS[3])).toBe('Write a caption for ');
  });

  it('falls back to the command name when a skill has no slug', () => {
    expect(
      promptCommandText({
        description: '',
        kind: 'skill',
        label: 'Loose',
        name: 'loose-skill',
      }),
    ).toBe('/loose-skill ');
  });
});

describe('insertPromptCommandText', () => {
  it('replaces the typed query with the command text', () => {
    const run = vi.fn();
    const insertContent = vi.fn(() => ({ run }));
    const deleteRange = vi.fn(() => ({ insertContent }));
    const focus = vi.fn(() => ({ deleteRange }));
    const chain = vi.fn(() => ({ focus }));
    const range = { from: 0, to: 6 };

    insertPromptCommandText({
      editor: { chain } as never,
      item: COMMANDS[0],
      range,
    });

    expect(deleteRange).toHaveBeenCalledWith(range);
    expect(insertContent).toHaveBeenCalledWith('/create ');
    expect(run).toHaveBeenCalled();
  });
});

describe('filterPromptCommands', () => {
  it('returns everything for an empty query', () => {
    expect(filterPromptCommands(COMMANDS, '')).toHaveLength(COMMANDS.length);
    expect(filterPromptCommands(COMMANDS, '   ')).toHaveLength(COMMANDS.length);
  });

  it('matches on the command name', () => {
    expect(filterPromptCommands(COMMANDS, 'crea').map((c) => c.name)).toEqual([
      'create',
    ]);
  });

  it('matches on the human label', () => {
    expect(
      filterPromptCommands(COMMANDS, 'Image Prompt').map((c) => c.name),
    ).toEqual(['image-prompt-engineer']);
  });

  it('matches on the description so a skill is findable by what it does', () => {
    expect(
      filterPromptCommands(COMMANDS, 'grilled').map((c) => c.name),
    ).toEqual(['interview']);
  });

  it('ignores case', () => {
    expect(filterPromptCommands(COMMANDS, 'INTERVIEW')).toHaveLength(1);
  });

  it('returns an empty palette when nothing matches', () => {
    expect(filterPromptCommands(COMMANDS, 'zzzz')).toEqual([]);
  });

  it('does not hand back the caller’s array', () => {
    expect(filterPromptCommands(COMMANDS, '')).not.toBe(COMMANDS);
  });
});

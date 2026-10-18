import { SkillSurface } from '@genfeedai/contracts';
import type { PromptCommand } from '@genfeedai/props/prompt-bars/prompt-command.props';
import { renderHook } from '@testing-library/react';
import type { PromptCommandsOptions } from '@ui/prompt-editor/prompt-commands.extension';
import { usePromptCommandExtension } from '@ui/prompt-editor/use-prompt-command-extension';
import { describe, expect, it, vi } from 'vitest';

const extensionMocks = vi.hoisted(() => ({
  insertPromptCommandText: vi.fn(),
  options: null as PromptCommandsOptions | null,
}));

const SKILL: PromptCommand = {
  description: 'Write a better prompt',
  kind: 'skill',
  label: 'Image prompt engineer',
  name: 'image-prompt-engineer',
  skillSlug: 'image-prompt-engineer',
};

vi.mock('@hooks/data/skills/use-surface-skill-commands', () => ({
  useSurfaceSkillCommands: () => ({ commands: [SKILL], skillSlugs: [] }),
}));
vi.mock('@ui/prompt-editor/prompt-commands.extension', () => ({
  PromptCommands: {
    configure: (options: PromptCommandsOptions) => {
      extensionMocks.options = options;
      return {};
    },
  },
  filterPromptCommands: (commands: PromptCommand[]) => commands,
  insertPromptCommandText: extensionMocks.insertPromptCommandText,
}));

const BANNER: PromptCommand = {
  description: 'Wide banner',
  group: 'Presets',
  kind: 'preset',
  label: 'Banner',
  name: 'banner',
};

function createEditor(text: string) {
  const run = vi.fn();
  const chain = {
    deleteRange: vi.fn(() => chain),
    focus: vi.fn(() => chain),
    run,
  };
  return {
    chain: () => chain,
    getText: () => text,
    run,
  };
}

describe('usePromptCommandExtension page context', () => {
  it('lists the page context ahead of the catalog', () => {
    const { result } = renderHook(() =>
      usePromptCommandExtension({ surface: SkillSurface.STUDIO }),
    );
    result.current.setContext({ commands: [BANNER], onSelect: vi.fn() });

    expect(extensionMocks.options?.getItems('')).toEqual([BANNER, SKILL]);

    result.current.setContext(null);
    expect(extensionMocks.options?.getItems('')).toEqual([SKILL]);
  });

  it('removes the typed query and hands a preset to the page', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      usePromptCommandExtension({ surface: SkillSurface.STUDIO }),
    );
    result.current.setContext({ commands: [BANNER], onSelect });
    const editor = createEditor('A launch');

    extensionMocks.options?.onSelect({
      editor: editor as never,
      item: BANNER,
      range: { from: 0, to: 4 },
    });

    expect(editor.run).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(BANNER, 'A launch');
    expect(extensionMocks.insertPromptCommandText).not.toHaveBeenCalled();
  });

  it('still inserts skills as their /slug token', () => {
    const { result } = renderHook(() =>
      usePromptCommandExtension({ surface: SkillSurface.STUDIO }),
    );
    result.current.setContext({ commands: [BANNER], onSelect: vi.fn() });
    const selection = {
      editor: createEditor('') as never,
      item: SKILL,
      range: { from: 0, to: 1 },
    };

    extensionMocks.options?.onSelect(selection);

    expect(extensionMocks.insertPromptCommandText).toHaveBeenCalledWith(
      selection,
    );
  });
});

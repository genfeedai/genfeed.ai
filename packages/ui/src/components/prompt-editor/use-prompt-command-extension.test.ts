import { SkillSurface } from '@genfeedai/contracts';
import { renderHook } from '@testing-library/react';
import { usePromptCommandExtension } from '@ui/prompt-editor/use-prompt-command-extension';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/data/skills/use-surface-skill-commands', () => ({
  useSurfaceSkillCommands: () => ({ commands: [], skillSlugs: [] }),
}));
vi.mock('@ui/prompt-editor/prompt-commands.extension', () => ({
  PromptCommands: { configure: () => ({}) },
  filterPromptCommands: vi.fn(),
  insertPromptCommandText: vi.fn(),
}));
describe('recognized handoff skills', () => {
  it('keeps removed catalog entries structured only while their tokens remain visible', () => {
    const { result } = renderHook(() =>
      usePromptCommandExtension({
        surface: SkillSurface.STUDIO,
        recognizedSkillSlugs: ['removed-skill'],
      }),
    );
    expect(result.current.resolveSubmit('/removed-skill A coast')).toEqual({
      content: 'A coast',
      skillSlugs: ['removed-skill'],
    });
    expect(result.current.resolveSubmit('A coast')).toEqual({
      content: 'A coast',
      skillSlugs: [],
    });
    expect(result.current.resolveSubmit('/unknown A coast')).toEqual({
      content: '/unknown A coast',
      skillSlugs: [],
    });
  });
});

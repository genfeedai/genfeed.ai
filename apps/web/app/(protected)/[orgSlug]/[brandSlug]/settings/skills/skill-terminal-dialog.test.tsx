// @vitest-environment jsdom
'use client';

import type { Skill } from '@services/content/skills.service';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SkillTerminalDialog from './skill-terminal-dialog';

const terminal = vi.hoisted(() => ({
  launches: [] as Array<{ kind: string; prompt: string }>,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  const translate = translateFromCatalog('common.settings.skills');

  return { useTranslations: () => translate };
});

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: vi.fn() }),
}));

vi.mock('@genfeedai/agent/components/AgentCliTerminal', () => ({
  AgentCliTerminalBody: () => <div data-testid="terminal-body" />,
  useAgentCliTerminal: (
    _apiService: unknown,
    _authReady: boolean,
    launch: { kind: string; prompt: string },
  ) => {
    terminal.launches.push(launch);
    return {
      containerRef: { current: null },
      isSearchOpen: false,
      searchQuery: '',
      setSearchQuery: vi.fn(),
      toggleSearch: vi.fn(),
    };
  },
}));

const skill = {
  defaultInstructions: 'Render the shot.',
  description: 'Mock up a shot.',
  id: 'skill-1',
  name: 'Three.js Previs',
  slug: 'threejs-previs',
  systemPromptTemplate: 'Render the shot.',
} as Skill;

describe('SkillTerminalDialog', () => {
  beforeEach(() => {
    terminal.launches = [];
  });

  it('opens a claude session on the skill instructions', () => {
    render(<SkillTerminalDialog onClose={vi.fn()} skill={skill} />);

    expect(
      screen.getByRole('dialog', {
        name: 'Run Three.js Previs in the terminal',
      }),
    ).toBeVisible();
    expect(screen.getByTestId('terminal-body')).toBeVisible();
    expect(terminal.launches[0]?.kind).toBe('claude');
    expect(terminal.launches[0]?.prompt).toContain('(threejs-previs)');
    expect(terminal.launches[0]?.prompt).toContain('Render the shot.');
  });

  it('starts no terminal while no skill is chosen', () => {
    render(<SkillTerminalDialog onClose={vi.fn()} skill={null} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(terminal.launches).toEqual([]);
  });
});

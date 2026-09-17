import { SkillSurface } from '@genfeedai/contracts';
import type { PromptCommand } from '@genfeedai/props/prompt-bars/prompt-command.props';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveAuthToken = vi.fn();
const listSkillsMock = vi.fn();

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: (...args: unknown[]) => mockResolveAuthToken(...args),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: vi.fn() }),
}));

vi.mock('@services/content/skills.service', () => ({
  SkillsService: {
    getInstance: () => ({ listSkills: listSkillsMock }),
  },
}));

import { useSurfaceSkillCommands } from './use-surface-skill-commands';

function makeSkill(overrides: Record<string, unknown> = {}) {
  return {
    category: 'writing',
    description: 'Does a thing',
    isEnabled: true,
    name: 'Hook Writer',
    slug: 'hook-writer',
    status: 'published',
    ...overrides,
  };
}

const BASE_COMMANDS: PromptCommand[] = [
  {
    description: 'Get grilled on your brand voice',
    kind: 'skill',
    label: 'Interview',
    name: 'interview',
    skillSlug: 'brand-interview',
  },
];

describe('useSurfaceSkillCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAuthToken.mockResolvedValue('token-1');
    listSkillsMock.mockResolvedValue([]);
  });

  it('requests the catalog for the given surface', async () => {
    renderHook(() => useSurfaceSkillCommands({ surface: SkillSurface.STUDIO }));

    await waitFor(() =>
      expect(listSkillsMock).toHaveBeenCalledWith({
        surface: SkillSurface.STUDIO,
      }),
    );
  });

  it('turns a skill into a command keyed by its slug', async () => {
    listSkillsMock.mockResolvedValue([makeSkill()]);

    const { result } = renderHook(() =>
      useSurfaceSkillCommands({ surface: SkillSurface.AGENT }),
    );

    await waitFor(() => expect(result.current.skillCommands).toHaveLength(1));
    expect(result.current.skillCommands[0]).toMatchObject({
      iconKey: 'writing',
      kind: 'skill',
      label: 'Hook Writer',
      name: 'hook-writer',
      skillSlug: 'hook-writer',
    });
  });

  it('hides a skill the organization has switched off', async () => {
    listSkillsMock.mockResolvedValue([
      makeSkill({ isEnabled: false, slug: 'off' }),
      makeSkill({ slug: 'disabled', status: 'disabled' }),
      makeSkill(),
    ]);

    const { result } = renderHook(() =>
      useSurfaceSkillCommands({ surface: SkillSurface.AGENT }),
    );

    await waitFor(() =>
      expect(result.current.skillCommands.map((c) => c.name)).toEqual([
        'hook-writer',
      ]),
    );
  });

  it('sorts skills by display name', async () => {
    listSkillsMock.mockResolvedValue([
      makeSkill({ name: 'Zebra', slug: 'zebra' }),
      makeSkill({ name: 'Alpha', slug: 'alpha' }),
    ]);

    const { result } = renderHook(() =>
      useSurfaceSkillCommands({ surface: SkillSurface.AGENT }),
    );

    await waitFor(() =>
      expect(result.current.skillCommands.map((c) => c.name)).toEqual([
        'alpha',
        'zebra',
      ]),
    );
  });

  it('does not list a skill a base command already fronts', async () => {
    listSkillsMock.mockResolvedValue([
      makeSkill({ name: 'Brand Interview', slug: 'brand-interview' }),
      makeSkill(),
    ]);

    const { result } = renderHook(() =>
      useSurfaceSkillCommands({
        baseCommands: BASE_COMMANDS,
        surface: SkillSurface.AGENT,
      }),
    );

    await waitFor(() =>
      expect(result.current.commands.map((c) => c.name)).toEqual([
        'interview',
        'hook-writer',
      ]),
    );
  });

  it('still reports a fronted slug as insertable', async () => {
    listSkillsMock.mockResolvedValue([
      makeSkill({ name: 'Brand Interview', slug: 'brand-interview' }),
      makeSkill(),
    ]);

    const { result } = renderHook(() =>
      useSurfaceSkillCommands({
        baseCommands: BASE_COMMANDS,
        surface: SkillSurface.AGENT,
      }),
    );

    await waitFor(() =>
      expect(result.current.skillSlugs).toEqual([
        'brand-interview',
        'hook-writer',
      ]),
    );
  });

  it('keeps the base commands when the catalog fails to load', async () => {
    listSkillsMock.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() =>
      useSurfaceSkillCommands({
        baseCommands: BASE_COMMANDS,
        surface: SkillSurface.AGENT,
      }),
    );

    await waitFor(() => expect(result.current.error).toBe('offline'));
    expect(result.current.commands.map((c) => c.name)).toEqual(['interview']);
  });

  it('does not call the API while disabled', async () => {
    const { result } = renderHook(() =>
      useSurfaceSkillCommands({
        baseCommands: BASE_COMMANDS,
        isEnabled: false,
        surface: SkillSurface.AGENT,
      }),
    );

    await waitFor(() => expect(result.current.commands).toHaveLength(1));
    expect(listSkillsMock).not.toHaveBeenCalled();
  });

  it('skips the request when there is no auth token', async () => {
    mockResolveAuthToken.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useSurfaceSkillCommands({ surface: SkillSurface.AGENT }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(listSkillsMock).not.toHaveBeenCalled();
    expect(result.current.skillCommands).toEqual([]);
  });
});

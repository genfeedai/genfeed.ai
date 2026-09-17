'use client';

import type { SkillSurface } from '@genfeedai/contracts';
import type { PromptCommand } from '@genfeedai/props/prompt-bars/prompt-command.props';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { type Skill, SkillsService } from '@services/content/skills.service';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const EMPTY_COMMANDS: PromptCommand[] = [];

export interface UseSurfaceSkillCommandsOptions {
  /** Extra commands (navigation actions, prompt starters) shown above skills. */
  baseCommands?: readonly PromptCommand[];
  /** Skips the fetch entirely — used while a composer is disabled or hidden. */
  isEnabled?: boolean;
  surface: SkillSurface;
}

export interface UseSurfaceSkillCommandsReturn {
  commands: PromptCommand[];
  error: string | null;
  isLoading: boolean;
  skillCommands: PromptCommand[];
  /** Every slug the palette can insert, base commands included. */
  skillSlugs: string[];
}

/**
 * A skill is only shown when the org can actually run it. `status` and
 * `isEnabled` are the org-level switches; the brand-level `enabledSkills`
 * selection is applied server-side when the turn resolves.
 */
function isOfferableSkill(skill: Skill): boolean {
  return skill.isEnabled !== false && skill.status !== 'disabled';
}

export function toSkillCommand(skill: Skill): PromptCommand {
  return {
    description: skill.description,
    iconKey: skill.category,
    kind: 'skill',
    label: skill.name,
    name: skill.slug,
    skillSlug: skill.slug,
  };
}

/**
 * Loads the `/` palette for one composer surface: the surface-filtered skill
 * catalog, appended to whatever static commands the surface owns.
 */
export function useSurfaceSkillCommands({
  baseCommands = EMPTY_COMMANDS,
  isEnabled = true,
  surface,
}: UseSurfaceSkillCommandsOptions): UseSurfaceSkillCommandsReturn {
  const { getToken } = useAuthIdentity();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  // Read through a ref: the fetch must re-run when the surface changes, never
  // because a caller handed us a fresh token getter on a re-render.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const loadSkills = useCallback(
    async (signal: AbortSignal) => {
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const token = await resolveAuthToken(getTokenRef.current);
        if (signal.aborted || requestId !== requestIdRef.current) {
          return;
        }

        if (!token) {
          setSkills([]);
          return;
        }

        const results = await SkillsService.getInstance(token).listSkills({
          surface,
        });

        if (signal.aborted || requestId !== requestIdRef.current) {
          return;
        }

        setSkills(results.filter(isOfferableSkill));
      } catch (caught) {
        if (signal.aborted || requestId !== requestIdRef.current) {
          return;
        }
        // The palette still works without skills — the static commands stay.
        setSkills([]);
        setError(
          caught instanceof Error ? caught.message : 'Failed to load skills',
        );
      } finally {
        if (!signal.aborted && requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [surface],
  );

  useEffect(() => {
    if (!isEnabled) {
      setSkills([]);
      return;
    }

    const controller = new AbortController();
    void loadSkills(controller.signal);

    return () => {
      controller.abort();
    };
  }, [isEnabled, loadSkills]);

  // A base command may already front a catalog skill (`/interview` fronts
  // `brand-interview`). Showing both would be two rows for one skill.
  const baseSkillSlugs = useMemo(
    () =>
      baseCommands
        .map((command) => command.skillSlug)
        .filter((slug): slug is string => Boolean(slug)),
    [baseCommands],
  );

  const skillCommands = useMemo(() => {
    const claimed = new Set(baseSkillSlugs);

    return [...skills]
      .filter((skill) => !claimed.has(skill.slug))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(toSkillCommand);
  }, [baseSkillSlugs, skills]);

  const commands = useMemo(
    () => [...baseCommands, ...skillCommands],
    [baseCommands, skillCommands],
  );

  const skillSlugs = useMemo(
    () => [
      ...new Set([
        ...baseSkillSlugs,
        ...skillCommands.map((command) => command.name),
      ]),
    ],
    [baseSkillSlugs, skillCommands],
  );

  return { commands, error, isLoading, skillCommands, skillSlugs };
}

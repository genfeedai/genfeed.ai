'use client';

import type { SkillSurface } from '@genfeedai/contracts';
import type { PromptCommand } from '@genfeedai/props/prompt-bars/prompt-command.props';
import { extractRequestedSkillSlugs } from '@helpers/content/prompt-command.helper';
import { useSurfaceSkillCommands } from '@hooks/data/skills/use-surface-skill-commands';
import type { AnyExtension } from '@tiptap/core';
import {
  filterPromptCommands,
  insertPromptCommandText,
  PromptCommands,
} from '@ui/prompt-editor/prompt-commands.extension';
import { useCallback, useMemo, useRef } from 'react';

export interface UsePromptCommandExtensionOptions {
  baseCommands?: readonly PromptCommand[];
  recognizedSkillSlugs?: readonly string[];
  isEnabled?: boolean;
  surface: SkillSurface;
}

export interface UsePromptCommandExtensionReturn {
  commands: PromptCommand[];
  /** Pass straight to `PromptEditor`'s `extraExtensions`; identity is stable. */
  extraExtensions: AnyExtension[];
  /**
   * Splits a composed prompt into the text to send and the skills the operator
   * picked. Call it at submit time — the tokens must not reach the model.
   */
  resolveSubmit: (prompt: string) => {
    content: string;
    skillSlugs: string[];
  };
}

/**
 * Wires the shared `/` palette into any TipTap composer.
 *
 * The extension is built once and reads the catalog through a ref, so skills
 * arriving after mount never rebuild the editor and never drop a draft.
 */
export function usePromptCommandExtension({
  baseCommands,
  recognizedSkillSlugs,
  isEnabled,
  surface,
}: UsePromptCommandExtensionOptions): UsePromptCommandExtensionReturn {
  const { commands, skillSlugs } = useSurfaceSkillCommands({
    baseCommands,
    isEnabled,
    surface,
  });

  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  const skillSlugsRef = useRef(skillSlugs);
  skillSlugsRef.current = [
    ...new Set([...skillSlugs, ...(recognizedSkillSlugs ?? [])]),
  ];

  const extraExtensions = useMemo(
    () => [
      PromptCommands.configure({
        getItems: (query) => filterPromptCommands(commandsRef.current, query),
        onSelect: insertPromptCommandText,
      }),
    ],
    [],
  );

  const resolveSubmit = useCallback(
    (prompt: string) =>
      extractRequestedSkillSlugs(prompt, skillSlugsRef.current),
    [],
  );

  return { commands, extraExtensions, resolveSubmit };
}

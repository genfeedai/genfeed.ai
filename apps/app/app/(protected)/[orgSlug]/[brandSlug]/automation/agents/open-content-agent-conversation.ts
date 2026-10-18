'use client';

import { useAgentDock } from '@contexts/ui/agent-dock-context';
import { useAgentChatStore } from '@genfeedai/agent';
import { useCallback } from 'react';

export function buildContentAgentSetupPrompt(brandId: string): string {
  return `Help me hire an agent to create recurring content for this brand. Ask what it should publish, where, and how often, and whether it may publish on its own. Then save it with save_content_agent. Brand id: ${brandId}.`;
}

export function buildContentAgentUpdatePrompt(input: {
  brandId?: string;
  id: string;
  label: string;
}): string {
  const brand = input.brandId ? ` Brand id: ${input.brandId}.` : '';
  return `Update the content agent "${input.label}" (id: ${input.id}). Ask what to change, then save it with save_content_agent.${brand}`;
}

export function useOpenContentAgentConversation(): (prompt: string) => void {
  const dock = useAgentDock();
  const seedComposer = useAgentChatStore((state) => state.seedComposer);

  return useCallback(
    (prompt: string) => {
      seedComposer(prompt);
      dock?.open();
    },
    [dock, seedComposer],
  );
}

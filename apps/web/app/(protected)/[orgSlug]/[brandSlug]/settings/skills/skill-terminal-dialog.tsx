'use client';

import {
  AgentCliTerminalBody,
  useAgentCliTerminal,
} from '@genfeedai/agent/components/AgentCliTerminal';
import { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import type { Skill } from '@services/content/skills.service';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { buildDesktopSkillPrompt } from '@/lib/skills/build-desktop-skill-prompt';

interface SkillTerminalProps {
  skill: Skill;
}

/**
 * A Claude Code session on this computer, opened on the skill. Mounted only
 * while the dialog is open: closing it unmounts the terminal, which ends the
 * session. Genfeed Desktop asks the member to allow the first terminal of a
 * launch, and Claude Code asks before it runs a command or writes a file.
 */
function SkillTerminal({ skill }: SkillTerminalProps) {
  const { getToken } = useAuthIdentity();
  const apiService = useMemo(
    () =>
      new AgentApiService({
        baseUrl: process.env.NEXT_PUBLIC_API_ENDPOINT ?? '',
        getToken: async (options) => resolveAuthToken(getToken, options),
      }),
    [getToken],
  );
  const terminal = useAgentCliTerminal(apiService, true, {
    kind: 'claude',
    prompt: buildDesktopSkillPrompt(skill),
  });

  return (
    <div className="h-[60vh] min-h-[24rem] overflow-hidden rounded-md">
      <AgentCliTerminalBody
        containerRef={terminal.containerRef}
        isSearchOpen={terminal.isSearchOpen}
        onCloseSearch={terminal.toggleSearch}
        onSearchQueryChange={terminal.setSearchQuery}
        searchQuery={terminal.searchQuery}
      />
    </div>
  );
}

export interface SkillTerminalDialogProps {
  onClose: () => void;
  skill: Skill | null;
}

export default function SkillTerminalDialog({
  onClose,
  skill,
}: SkillTerminalDialogProps) {
  const translate = useTranslations('common.settings.skills');

  return (
    <Dialog
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      open={skill !== null}
    >
      <DialogContent className="max-w-4xl" data-testid="skill-terminal-dialog">
        <DialogHeader>
          <DialogTitle>
            {translate('terminal.title', { name: skill?.name ?? '' })}
          </DialogTitle>
          <DialogDescription>
            {translate('terminal.description')}
          </DialogDescription>
        </DialogHeader>
        {skill ? <SkillTerminal key={skill.id} skill={skill} /> : null}
      </DialogContent>
    </Dialog>
  );
}

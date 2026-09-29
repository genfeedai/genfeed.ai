import type { AgentType } from '@genfeedai/contracts';

export interface AgentPresetAvatarProps {
  className?: string;
  platforms: string[];
  presetId: string;
  type: AgentType | string;
}

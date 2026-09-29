import type { AgentType } from '@genfeedai/contracts';
import type { IconComponent } from '@genfeedai/contracts/types/icon';

export interface AgentPresetAvatarProps {
  className?: string;
  platforms: string[];
  presetId: string;
  type: AgentType | string;
}

export interface PlatformBrand {
  faceClassName: string;
  Icon: IconComponent;
}

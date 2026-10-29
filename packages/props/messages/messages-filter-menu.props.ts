import type {
  ICredential,
  SocialAutomationState,
  SocialPlatform,
} from '@genfeedai/contracts/interfaces';
import type {
  MessagesBrandFilterOption,
  MessagesInboxView,
  MessagesSurface,
} from '@genfeedai/props/messages/messages-conversation-sidebar.props';

export interface MessagesFilterMenuProps {
  accounts: readonly ICredential[];
  automationState: SocialAutomationState | 'all';
  brandFilter: string;
  brandOptions: readonly MessagesBrandFilterOption[];
  conversationType: MessagesSurface;
  credentialId: string;
  /** The brand the route scopes the inbox to; picking it is "no brand filter". */
  defaultBrandFilter: string;
  onAutomationStateChange: (value: SocialAutomationState | 'all') => void;
  onBrandFilterChange: (brandId: string) => void;
  onClear: () => void;
  onConversationTypeChange: (conversationType: MessagesSurface) => void;
  onCredentialIdChange: (credentialId: string) => void;
  onPlatformChange: (platform: SocialPlatform | 'all') => void;
  onViewChange: (view: MessagesInboxView) => void;
  platform: SocialPlatform | 'all';
  view: MessagesInboxView;
}

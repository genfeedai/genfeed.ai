import type { PublishingContentAccount } from '@props/posts/publishing-content-entry.props';

/** A channel that is not a connected account: a platform, email or the website. */
export interface ChannelDropdownOption {
  label: string;
  value: string;
}

export interface ChannelDropdownProps {
  /** Connected accounts, listed first. Selecting one stores `account:<id>`. */
  accounts: PublishingContentAccount[];
  ariaLabel: string;
  /** Every other channel, tucked under the "More" sub-menu. */
  channels: ChannelDropdownOption[];
  className?: string;
  /** `all`, a channel value, or `account:<id>`. */
  value: string;
  onChange: (value: string) => void;
}

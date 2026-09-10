export interface PostCharacterUsageItem {
  /** Stable row key — the credential id of the channel being counted. */
  id: string;
  /** Account name shown to the creator, e.g. `Nevo David`. */
  accountLabel: string;
  /** Channel label from the capability catalog, e.g. `LinkedIn`. */
  platformLabel: string;
  /** Characters the outgoing caption currently uses on this channel. */
  used: number;
  /** Caption ceiling for this channel. */
  limit: number;
}

export interface PostCharacterUsageProps {
  items: PostCharacterUsageItem[];
  className?: string;
  /** Heading above the list. Omit for a bare list inside existing chrome. */
  title?: string;
}

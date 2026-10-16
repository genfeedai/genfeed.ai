export interface AgentBrandMentionItem {
  brandName: string;
  brandSlug: string;
  id: string;
}

export interface AgentTeamMentionItem {
  avatar?: string;
  displayName: string;
  id: string;
  isAgent: boolean;
  role: string;
}

export interface AgentContentMentionItem {
  brandId: string | null;
  contentTitle: string;
  contentType: string;
  id: string;
  thumbnailUrl?: string;
}

export interface AgentCharacterMentionItem {
  availableBrandCount?: number;
  /** Primary reference image (position 0 of `referenceIngredientIds`). */
  avatarIngredientId?: string | null;
  /** Owning organization of a character granted to this one (#6037). */
  grantedByOrganizationName?: string | null;
  handle: string;
  /** True when `referenceIngredientIds` is not empty. */
  hasReferenceImage: boolean;
  id: string;
  isGranted?: boolean;
  isShared?: boolean;
  label: string;
  owningBrandName?: string | null;
  /** Every live reference image of the character, primary first. */
  referenceIngredientIds: string[];
}

export interface AgentCharacterMentionsResponse {
  mentions: AgentCharacterMentionItem[];
}

export interface CharacterHandleResolution {
  /**
   * Every reference image of every resolved handle, flat: handles in request
   * order, each handle's references in position order, first occurrence kept.
   */
  resolvedIngredientIds: readonly string[];
  unresolvedHandles: readonly string[];
}

export interface AgentTeamMentionsResponse {
  mentions: AgentTeamMentionItem[];
}

export interface AgentContentMentionsResponse {
  mentions: AgentContentMentionItem[];
}

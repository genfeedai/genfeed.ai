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
  avatarIngredientId?: string | null;
  /** Owning organization of a character granted to this one (#6037). */
  grantedByOrganizationName?: string | null;
  handle: string;
  hasReferenceImage: boolean;
  id: string;
  isGranted?: boolean;
  isShared?: boolean;
  label: string;
  owningBrandName?: string | null;
}

export interface AgentCharacterMentionsResponse {
  mentions: AgentCharacterMentionItem[];
}

export interface CharacterHandleResolution {
  resolvedIngredientIds: readonly string[];
  unresolvedHandles: readonly string[];
}

export interface AgentTeamMentionsResponse {
  mentions: AgentTeamMentionItem[];
}

export interface AgentContentMentionsResponse {
  mentions: AgentContentMentionItem[];
}

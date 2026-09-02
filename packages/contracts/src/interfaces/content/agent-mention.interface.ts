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
  contentTitle: string;
  contentType: string;
  id: string;
  thumbnailUrl?: string;
}

export interface AgentCharacterMentionItem {
  avatarIngredientId?: string | null;
  handle: string;
  hasReferenceImage: boolean;
  id: string;
  label: string;
}

export interface AgentCharacterMentionsResponse {
  mentions: AgentCharacterMentionItem[];
}

export interface AgentTeamMentionsResponse {
  mentions: AgentTeamMentionItem[];
}

export interface AgentContentMentionsResponse {
  mentions: AgentContentMentionItem[];
}

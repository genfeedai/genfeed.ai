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

export interface AgentTeamMentionsResponse {
  mentions: AgentTeamMentionItem[];
}

export interface AgentContentMentionsResponse {
  mentions: AgentContentMentionItem[];
}

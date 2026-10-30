export interface AgentMarketplaceProps {
  /** The selected team group, or `all`. */
  category: string;
  isSubmitting: boolean;
  onActivate: (presetId: string) => Promise<void> | void;
  /** The text the list is narrowed by. */
  searchQuery: string;
  submittingPresetId: string | null;
}

export interface AgentMarketplaceSearchProps {
  category: string;
  onCategoryChange: (category: string) => void;
  onSearchQueryChange: (query: string) => void;
  searchQuery: string;
}

export interface MediaReference {
  id: string;
  ingredientUrl?: string;
  url?: string;
  metadataHeight?: number;
  metadataWidth?: number;
  name?: string;
  title?: string;
}

export interface AccountMediaReference extends MediaReference {
  url: string;
}

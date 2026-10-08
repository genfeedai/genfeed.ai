/**
 * Facebook API response types
 */

/**
 * Facebook Page information from Graph API
 */
export interface FacebookPage {
  id: string;
  instagram_business_account?: { id?: string };
  name?: string;
  access_token?: string;
  category?: string;
  picture?: {
    data?: {
      url?: string;
    };
  };
}

/**
 * Facebook Insights metric data
 */
export interface FacebookInsight {
  name: string;
  values?: Array<{
    value: number;
  }>;
}

/**
 * Facebook post reaction type
 */
export interface FacebookReaction {
  type: string;
}

export interface MetaPageIdentity {
  pageId?: string;
  instagramAccountId?: string;
}
export interface MetaPageAccess {
  pageId: string;
  accessToken: string;
}
export interface MetaPageListResponse {
  data?: FacebookPage[];
  paging?: { cursors?: { after?: string }; next?: string };
}

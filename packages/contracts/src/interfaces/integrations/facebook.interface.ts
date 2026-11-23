/**
 * Facebook API response types
 */

/**
 * Facebook Page information from Graph API
 */
export interface FacebookPage {
  id: string;
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
}
export interface MetaPageAccess {
  pageId: string;
  accessToken: string;
}
export interface MetaPageListResponse {
  data?: FacebookPage[];
  paging?: { cursors?: { after?: string }; next?: string };
}

/** A Facebook Page the connected user manages. */
export interface IFacebookManagedPage {
  id: string;
  name: string;
  category?: string;
  /** Page picture URL. */
  picture?: string;
}

/** One Facebook Page a pending connection can choose. */
export interface IFacebookPageCandidate extends IFacebookManagedPage {
  /** Another live credential of the brand already holds this Page. */
  isAlreadyConnected: boolean;
}

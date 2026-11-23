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

/** One comment (or reply) on a post of a connected Facebook Page. */
export interface IFacebookPageComment {
  authorExternalId?: string;
  authorName?: string;
  commentId: string;
  createdAt: Date;
  /** The Page itself wrote this comment, so it is an outbound reply. */
  isFromPage: boolean;
  postId: string;
  postTitle?: string;
  postUrl?: string;
  text: string;
  /** The top-level comment this one belongs to (its own id when top-level). */
  threadId: string;
}

/** A Graph comment node as the Page's `published_posts` edge returns it. */
export interface IFacebookGraphComment {
  created_time?: string;
  from?: { id?: string; name?: string };
  id: string;
  message?: string;
  parent?: { id?: string };
}

/** A Page post with the comments Graph expanded onto it. */
export interface IFacebookGraphPost {
  comments?: { data?: IFacebookGraphComment[] };
  id: string;
  message?: string;
  permalink_url?: string;
}

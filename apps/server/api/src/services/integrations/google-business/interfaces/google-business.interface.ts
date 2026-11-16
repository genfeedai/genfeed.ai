/** One business location a connected Google account can post to. */
export interface GoogleBusinessLocation {
  /** `accounts/{accountId}/locations/{locationId}`, the form the posts API takes. */
  id: string;
  title: string;
  /** One line of the storefront address, to tell same-named locations apart. */
  address?: string;
}

export type GoogleBusinessCallToActionType =
  | 'BOOK'
  | 'ORDER'
  | 'SHOP'
  | 'LEARN_MORE'
  | 'SIGN_UP'
  | 'CALL';

type GoogleBusinessLocalPostState =
  | 'LOCAL_POST_STATE_UNSPECIFIED'
  | 'REJECTED'
  | 'LIVE'
  | 'PROCESSING';

/** The part of a v4 `LocalPost` Genfeed sends. */
export interface GoogleBusinessLocalPostInput {
  callToAction?: {
    actionType: GoogleBusinessCallToActionType;
    url?: string;
  };
  languageCode?: string;
  media?: Array<{ mediaFormat: 'PHOTO'; sourceUrl: string }>;
  summary: string;
  topicType: 'STANDARD';
}

/** The part of a v4 `LocalPost` Genfeed reads back. */
export interface GoogleBusinessLocalPost {
  createTime?: string;
  media?: unknown[];
  name: string;
  searchUrl?: string;
  state?: GoogleBusinessLocalPostState;
  summary?: string;
  topicType?: string;
}

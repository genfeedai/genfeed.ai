/** Most Pages one Facebook connect can add, so a large portfolio cannot hold a request open. */
export const FACEBOOK_MAX_SELECTED_PAGES = 25;

/** The Page webhook field that delivers comments on a Page's posts. */
export const FACEBOOK_FEED_WEBHOOK_FIELD = 'feed';

/** The permission Meta requires to subscribe a Page to the app's webhooks. */
export const FACEBOOK_PAGE_WEBHOOK_SCOPE = 'pages_manage_metadata';

/** The Page webhook field that delivers messages people send to a Page. */
export const FACEBOOK_MESSENGER_WEBHOOK_FIELD = 'messages';

/** The permission Meta requires to read and send Messenger messages as a Page. */
export const FACEBOOK_MESSENGER_SCOPE = 'pages_messaging';

/**
 * A Page may answer a person (message type RESPONSE) for 24 hours after that
 * person's last message. After that Meta rejects the send.
 *
 * @see https://developers.facebook.com/docs/messenger-platform/send-messages#messaging_types
 */
export const FACEBOOK_MESSENGER_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

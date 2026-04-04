/**
 * This file is auto-generated from the OpenAPI spec.
 * DO NOT EDIT MANUALLY.
 *
 * To regenerate:
 *   cd packages/api-types && bun run generate
 *
 * PLACEHOLDER: Run the generation script with the API server running to populate this file.
 */

export interface paths {
  '/posts': {
    get: {
      responses: {
        200: {
          content: {
            'application/json': components['schemas']['PostListResponse'];
          };
        };
      };
    };
    post: {
      requestBody: {
        content: {
          'application/json': components['schemas']['CreatePostDto'];
        };
      };
      responses: {
        201: {
          content: {
            'application/json': components['schemas']['PostResponse'];
          };
        };
      };
    };
  };
  '/posts/{id}': {
    get: {
      parameters: {
        path: {
          id: string;
        };
      };
      responses: {
        200: {
          content: {
            'application/json': components['schemas']['PostResponse'];
          };
        };
      };
    };
    patch: {
      parameters: {
        path: {
          id: string;
        };
      };
      requestBody: {
        content: {
          'application/json': components['schemas']['UpdatePostDto'];
        };
      };
      responses: {
        200: {
          content: {
            'application/json': components['schemas']['PostResponse'];
          };
        };
      };
    };
    delete: {
      parameters: {
        path: {
          id: string;
        };
      };
      responses: {
        200: {
          content: {
            'application/json': components['schemas']['PostResponse'];
          };
        };
      };
    };
  };
}

export interface components {
  schemas: {
    CreatePostDto: {
      /** Array of ingredient IDs. Max: 35 (TikTok limit). */
      ingredients: string[];
      /** The credential ID (platform account) to use for publishing */
      credential: string;
      /** The title/label of the post */
      label: string;
      /** The description/caption for the post */
      description: string;
      /** Type of media being published */
      category?:
        | 'article'
        | 'video'
        | 'post'
        | 'reel'
        | 'story'
        | 'image'
        | 'text';
      /** The current status of the post */
      status:
        | 'public'
        | 'private'
        | 'unlisted'
        | 'draft'
        | 'scheduled'
        | 'processing'
        | 'pending'
        | 'failed';
      /** Optional tags/hashtags to include with the post */
      tags?: string[];
      /** When the post is scheduled to be posted (ISO 8601) */
      scheduledDate?: string;
      /** IANA timezone string for the scheduled date */
      timezone?: string;
      /** When the post was actually posted (ISO 8601) */
      publicationDate?: string;
      /** Whether this post should repeat on a schedule */
      isRepeat?: boolean;
      /** How often the post should repeat */
      repeatFrequency?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
      /** The interval between repeats */
      repeatInterval?: number;
      /** When to stop repeating the post (ISO 8601) */
      repeatEndDate?: string;
      /** Maximum number of times to repeat (0 = unlimited) */
      maxRepeats?: number;
      /** Days of week to repeat (0=Sunday, 6=Saturday) */
      repeatDaysOfWeek?: number[];
      /** External platform ID for the published content */
      externalId?: string;
      /** External platform shortcode for the published content */
      externalShortcode?: string;
      /** Twitter-specific: ID of tweet to quote */
      quoteTweetId?: string;
      /** Group ID for batch post notifications */
      groupId?: string;
      /** Parent post ID for thread replies */
      parent?: string;
      /** Position/order within thread */
      order?: number;
      /** For Instagram Reels only: whether to share to main feed */
      isShareToFeedSelected?: boolean;
      /** Whether to fetch analytics for the post */
      isAnalyticsEnabled?: boolean;
    };
    UpdatePostDto: {
      /** Array of ingredient IDs. Max: 35 (TikTok limit). */
      ingredients?: string[];
      /** The credential ID (platform account) to use for publishing */
      credential?: string;
      /** The title/label of the post */
      label?: string;
      /** The description/caption for the post */
      description?: string;
      /** Type of media being published */
      category?:
        | 'article'
        | 'video'
        | 'post'
        | 'reel'
        | 'story'
        | 'image'
        | 'text';
      /** The current status of the post */
      status?:
        | 'public'
        | 'private'
        | 'unlisted'
        | 'draft'
        | 'scheduled'
        | 'processing'
        | 'pending'
        | 'failed';
      /** Optional tags/hashtags to include with the post */
      tags?: string[];
      /** When the post is scheduled to be posted (ISO 8601) */
      scheduledDate?: string;
      /** IANA timezone string for the scheduled date */
      timezone?: string;
      /** When the post was actually posted (ISO 8601) */
      publicationDate?: string;
      /** Whether this post should repeat on a schedule */
      isRepeat?: boolean;
      /** How often the post should repeat */
      repeatFrequency?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
      /** The interval between repeats */
      repeatInterval?: number;
      /** When to stop repeating the post (ISO 8601) */
      repeatEndDate?: string;
      /** Maximum number of times to repeat (0 = unlimited) */
      maxRepeats?: number;
      /** Days of week to repeat (0=Sunday, 6=Saturday) */
      repeatDaysOfWeek?: number[];
      /** External platform ID for the published content */
      externalId?: string;
      /** External platform shortcode for the published content */
      externalShortcode?: string;
      /** Twitter-specific: ID of tweet to quote */
      quoteTweetId?: string;
      /** Group ID for batch post notifications */
      groupId?: string;
      /** Parent post ID for thread replies */
      parent?: string;
      /** Position/order within thread */
      order?: number;
      /** For Instagram Reels only: whether to share to main feed */
      isShareToFeedSelected?: boolean;
      /** Whether to fetch analytics for the post */
      isAnalyticsEnabled?: boolean;
    };
    PostResponse: {
      data: {
        id: string;
        type: 'posts';
        attributes: {
          [key: string]: unknown;
        };
      };
    };
    PostListResponse: {
      data: Array<{
        id: string;
        type: 'posts';
        attributes: {
          [key: string]: unknown;
        };
      }>;
    };
  };
}

export type operations = Record<string, never>;

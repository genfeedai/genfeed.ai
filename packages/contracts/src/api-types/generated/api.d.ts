import type {
  PostCategory,
  PostFrequency,
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '../..';

export interface components {
  schemas: {
    CreatePostDto: {
      category?: PostCategory;
      credentialId: string;
      description: string;
      externalId?: string;
      externalShortcode?: string;
      groupId?: string;
      ingredients: string[];
      isAnalyticsEnabled?: boolean;
      isRepeat?: boolean;
      isShareToFeedSelected?: boolean;
      label: string;
      maxRepeats?: number;
      order?: number;
      parentId?: string;
      contentRunId?: string;
      personaId?: string;
      variantId?: string;
      hookVersion?: string;
      creativeVersion?: string;
      scheduleSlot?: string;
      publishIntent?: string;
      source?: string;
      publicationDate?: string;
      quoteTweetId?: string;
      repeatDaysOfWeek?: number[];
      repeatEndDate?: string;
      repeatFrequency?: PostFrequency;
      repeatInterval?: number;
      scheduledDate?: string;
      status?: PostStatus;
      targetExecutionState?: TargetExecutionState;
      tags?: string[];
      timezone?: string;
      visibility?: PostVisibility;
    };
    UpdatePostDto: {
      category?: PostCategory;
      credentialId?: string;
      description?: string;
      externalId?: string;
      externalShortcode?: string;
      groupId?: string;
      ingredients?: string[];
      isAnalyticsEnabled?: boolean;
      isRepeat?: boolean;
      isShareToFeedSelected?: boolean;
      label?: string;
      maxRepeats?: number;
      order?: number;
      parentId?: string;
      contentRunId?: string;
      personaId?: string;
      variantId?: string;
      hookVersion?: string;
      creativeVersion?: string;
      scheduleSlot?: string;
      publishIntent?: string;
      publicationDate?: string;
      quoteTweetId?: string;
      repeatDaysOfWeek?: number[];
      repeatEndDate?: string;
      repeatFrequency?: PostFrequency;
      repeatInterval?: number;
      scheduledDate?: string;
      status?: PostStatus;
      targetExecutionState?: TargetExecutionState;
      tags?: string[];
      timezone?: string;
      visibility?: PostVisibility;
    };
  };
}

export type paths = {};

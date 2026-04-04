import { describe, expect, it } from 'vitest';
import {
  CampaignDiscoverySource,
  CampaignPlatform,
  CampaignSkipReason,
  CampaignStatus,
  CampaignTargetStatus,
  CampaignTargetType,
  CampaignType,
} from '../src/campaign.enum';

describe('campaign.enum', () => {
  describe('CampaignPlatform', () => {
    it('should have 3 members', () => {
      expect(Object.values(CampaignPlatform)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(CampaignPlatform.TWITTER).toBe('twitter');
      expect(CampaignPlatform.REDDIT).toBe('reddit');
      expect(CampaignPlatform.INSTAGRAM).toBe('instagram');
    });
  });

  describe('CampaignType', () => {
    it('should have 4 members', () => {
      expect(Object.values(CampaignType)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(CampaignType.MANUAL).toBe('manual');
      expect(CampaignType.DISCOVERY).toBe('discovery');
      expect(CampaignType.SCHEDULED_BLAST).toBe('scheduled');
      expect(CampaignType.DM_OUTREACH).toBe('dm_outreach');
    });
  });

  describe('CampaignStatus', () => {
    it('should have 4 members', () => {
      expect(Object.values(CampaignStatus)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(CampaignStatus.DRAFT).toBe('draft');
      expect(CampaignStatus.ACTIVE).toBe('active');
      expect(CampaignStatus.PAUSED).toBe('paused');
      expect(CampaignStatus.COMPLETED).toBe('completed');
    });
  });

  describe('CampaignTargetStatus', () => {
    it('should have 7 members', () => {
      expect(Object.values(CampaignTargetStatus)).toHaveLength(7);
    });

    it('should have correct values', () => {
      expect(CampaignTargetStatus.PENDING).toBe('pending');
      expect(CampaignTargetStatus.SCHEDULED).toBe('scheduled');
      expect(CampaignTargetStatus.PROCESSING).toBe('processing');
      expect(CampaignTargetStatus.REPLIED).toBe('replied');
      expect(CampaignTargetStatus.SENT).toBe('sent');
      expect(CampaignTargetStatus.SKIPPED).toBe('skipped');
      expect(CampaignTargetStatus.FAILED).toBe('failed');
    });
  });

  describe('CampaignDiscoverySource', () => {
    it('should have 5 members', () => {
      expect(Object.values(CampaignDiscoverySource)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(CampaignDiscoverySource.KEYWORD_SEARCH).toBe('keyword_search');
      expect(CampaignDiscoverySource.TRENDING).toBe('trending');
      expect(CampaignDiscoverySource.HASHTAG).toBe('hashtag');
      expect(CampaignDiscoverySource.SUBREDDIT).toBe('subreddit');
      expect(CampaignDiscoverySource.MANUAL).toBe('manual');
    });
  });

  describe('CampaignTargetType', () => {
    it('should have 4 members', () => {
      expect(Object.values(CampaignTargetType)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(CampaignTargetType.TWEET).toBe('tweet');
      expect(CampaignTargetType.REDDIT_POST).toBe('reddit_post');
      expect(CampaignTargetType.REDDIT_COMMENT).toBe('reddit_comment');
      expect(CampaignTargetType.DM_RECIPIENT).toBe('dm_recipient');
    });
  });

  describe('CampaignSkipReason', () => {
    it('should have 11 members', () => {
      expect(Object.values(CampaignSkipReason)).toHaveLength(11);
    });

    it('should have correct values', () => {
      expect(CampaignSkipReason.BLOCKED_AUTHOR).toBe('blocked_author');
      expect(CampaignSkipReason.LOW_RELEVANCE).toBe('low_relevance');
      expect(CampaignSkipReason.CONTENT_TOO_OLD).toBe('content_too_old');
      expect(CampaignSkipReason.LOW_ENGAGEMENT).toBe('low_engagement');
      expect(CampaignSkipReason.HIGH_ENGAGEMENT).toBe('high_engagement');
      expect(CampaignSkipReason.ALREADY_REPLIED).toBe('already_replied');
      expect(CampaignSkipReason.RATE_LIMITED).toBe('rate_limited');
      expect(CampaignSkipReason.CAMPAIGN_PAUSED).toBe('campaign_paused');
      expect(CampaignSkipReason.MANUAL_SKIP).toBe('manual_skip');
      expect(CampaignSkipReason.DM_NOT_ALLOWED).toBe('dm_not_allowed');
      expect(CampaignSkipReason.USER_NOT_FOUND).toBe('user_not_found');
    });
  });
});

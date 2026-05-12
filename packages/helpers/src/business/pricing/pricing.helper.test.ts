import {
  AVATAR_CREDIT_COSTS,
  applyMargin,
  creatorPlan,
  dedicatedServerPlan,
  formatOutputs,
  formatPrice,
  getCloudTeamsPlan,
  getCreatorPlan,
  getEnterprisePlan,
  getHostedPlan,
  getPlanByLabel,
  getProPlan,
  getScalePlan,
  INTERNAL_CREDIT_COSTS,
  VIDEO_CREDIT_COSTS,
  websitePlans,
} from '@helpers/business/pricing/pricing.helper';
import { describe, expect, it } from 'vitest';

describe('pricing.helper', () => {
  describe('INTERNAL_CREDIT_COSTS', () => {
    it('should have correct image credit cost', () => {
      expect(INTERNAL_CREDIT_COSTS.image).toBe(50);
    });

    it('should have correct 4K image credit cost', () => {
      expect(INTERNAL_CREDIT_COSTS.image4k).toBe(100);
    });

    it('should have correct video per second credit cost', () => {
      expect(INTERNAL_CREDIT_COSTS.videoPerSecond).toBe(75);
    });

    it('should have correct avatar per second credit cost', () => {
      expect(INTERNAL_CREDIT_COSTS.avatarPerSecond).toBe(100);
    });

    it('should have correct voice per minute credit cost', () => {
      expect(INTERNAL_CREDIT_COSTS.voicePerMinute).toBe(17);
    });
  });

  describe('VIDEO_CREDIT_COSTS', () => {
    it('should calculate 4s video cost as videoPerSecond * 4', () => {
      expect(VIDEO_CREDIT_COSTS.video4s).toBe(75 * 4);
    });

    it('should calculate 8s video cost as videoPerSecond * 8', () => {
      expect(VIDEO_CREDIT_COSTS.video8s).toBe(75 * 8);
    });

    it('should calculate 15s video cost as videoPerSecond * 15', () => {
      expect(VIDEO_CREDIT_COSTS.video15s).toBe(75 * 15);
    });
  });

  describe('AVATAR_CREDIT_COSTS', () => {
    it('should calculate 4s avatar cost as avatarPerSecond * 4', () => {
      expect(AVATAR_CREDIT_COSTS.avatar4s).toBe(100 * 4);
    });

    it('should calculate 8s avatar cost as avatarPerSecond * 8', () => {
      expect(AVATAR_CREDIT_COSTS.avatar8s).toBe(100 * 8);
    });

    it('should calculate 15s avatar cost as avatarPerSecond * 15', () => {
      expect(AVATAR_CREDIT_COSTS.avatar15s).toBe(100 * 15);
    });
  });

  describe('websitePlans', () => {
    it('should have 4 plans', () => {
      expect(websitePlans).toHaveLength(4);
    });

    it('should have Self-Hosted, Hosted, Cloud Teams, Enterprise labels in order', () => {
      const labels = websitePlans.map((p) => p.label);
      expect(labels).toEqual([
        'Self-Hosted',
        'Hosted',
        'Cloud Teams',
        'Enterprise',
      ]);
    });

    it('should have correct plan types', () => {
      const types = websitePlans.map((p) => p.type);
      expect(types).toEqual(['byok', 'payg', 'subscription', 'enterprise']);
    });

    it('should have correct prices', () => {
      const prices = websitePlans.map((p) => p.price);
      expect(prices).toEqual([0, 49, 499, null]);
    });

    it('Self-Hosted plan should have null outputs', () => {
      const selfHosted = websitePlans[0];
      expect(selfHosted.outputs).toBeNull();
    });

    it('Hosted plan should use PAYG output', () => {
      const hosted = websitePlans[1];
      expect(hosted.outputs).toBeNull();
      expect(hosted.interval).toBe('payg');
    });

    it('Cloud Teams plan should be B2B cloud without bundled output quotas', () => {
      const cloudTeams = websitePlans[2];
      expect(cloudTeams.outputs).toBeNull();
      expect(cloudTeams.features).toContain('Multi-organization account model');
      expect(cloudTeams.features).toContain('Multi-brand operations');
    });

    it('Enterprise plan should have null outputs for custom terms', () => {
      const enterprise = websitePlans[3];
      expect(enterprise.outputs).toBeNull();
    });
  });

  describe('getPlanByLabel', () => {
    it('should find Hosted plan case-insensitively', () => {
      expect(getPlanByLabel('hosted')?.label).toBe('Hosted');
      expect(getPlanByLabel('HOSTED')?.label).toBe('Hosted');
      expect(getPlanByLabel('Hosted')?.label).toBe('Hosted');
    });

    it('should find Cloud Teams plan', () => {
      expect(getPlanByLabel('cloud teams')?.price).toBe(499);
    });

    it('should find Self-Hosted plan', () => {
      expect(getPlanByLabel('self-hosted')?.price).toBe(0);
    });

    it('should find Enterprise plan', () => {
      expect(getPlanByLabel('enterprise')?.price).toBeNull();
    });

    it('should return undefined for unknown label', () => {
      expect(getPlanByLabel('nonexistent')).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      expect(getPlanByLabel('')).toBeUndefined();
    });
  });

  describe('getHostedPlan', () => {
    it('should return the Hosted plan', () => {
      const plan = getHostedPlan();
      expect(plan.label).toBe('Hosted');
      expect(plan.price).toBe(49);
    });
  });

  describe('getCloudTeamsPlan', () => {
    it('should return the Cloud Teams plan', () => {
      const plan = getCloudTeamsPlan();
      expect(plan.label).toBe('Cloud Teams');
      expect(plan.price).toBe(499);
    });
  });

  describe('getProPlan', () => {
    it('should return the Hosted plan as a legacy alias', () => {
      const plan = getProPlan();
      expect(plan.label).toBe('Hosted');
      expect(plan.price).toBe(49);
    });
  });

  describe('getScalePlan', () => {
    it('should return the Cloud Teams plan as a legacy alias', () => {
      const plan = getScalePlan();
      expect(plan.label).toBe('Cloud Teams');
      expect(plan.price).toBe(499);
    });
  });

  describe('getEnterprisePlan', () => {
    it('should return the Enterprise plan', () => {
      const plan = getEnterprisePlan();
      expect(plan.label).toBe('Enterprise');
      expect(plan.price).toBeNull();
    });
  });

  describe('getCreatorPlan', () => {
    it('should return the creator plan', () => {
      const plan = getCreatorPlan();
      expect(plan.label).toBe('Creator');
      expect(plan.price).toBe(50);
    });

    it('should return same object as creatorPlan constant', () => {
      expect(getCreatorPlan()).toBe(creatorPlan);
    });
  });

  describe('formatPrice', () => {
    it('should return "Contact Sales" for null', () => {
      expect(formatPrice(null)).toBe('Contact Sales');
    });

    it('should return "Free" for 0', () => {
      expect(formatPrice(0)).toBe('Free');
    });

    it('should format positive prices with dollar sign', () => {
      expect(formatPrice(499)).toBe('$499');
    });

    it('should format large prices with locale string', () => {
      expect(formatPrice(4999)).toBe('$4,999');
    });

    it('should format very large prices', () => {
      expect(formatPrice(10000)).toBe('$10,000');
    });
  });

  describe('formatOutputs', () => {
    it('should return null for null outputs', () => {
      expect(formatOutputs(null)).toBeNull();
    });

    it('should return null for undefined outputs', () => {
      expect(formatOutputs(undefined)).toBeNull();
    });

    it('should format all output types', () => {
      const result = formatOutputs({
        images: 500,
        videoMinutes: 5,
        voiceMinutes: 60,
      });
      expect(result).toBe('5 min video \u00b7 500 images \u00b7 60 min voice');
    });

    it('should format video minutes only', () => {
      const result = formatOutputs({ videoMinutes: 10 });
      expect(result).toBe('10 min video');
    });

    it('should format images only', () => {
      const result = formatOutputs({ images: 100 });
      expect(result).toBe('100 images');
    });

    it('should format voice only', () => {
      const result = formatOutputs({ voiceMinutes: 30 });
      expect(result).toBe('30 min voice');
    });

    it('should format large image counts with locale string', () => {
      const result = formatOutputs({ images: 2000 });
      expect(result).toBe('2,000 images');
    });

    it('should format video and images without voice', () => {
      const result = formatOutputs({ images: 500, videoMinutes: 5 });
      expect(result).toBe('5 min video \u00b7 500 images');
    });
  });

  describe('dedicatedServerPlan', () => {
    it('should have null price (custom pricing)', () => {
      expect(dedicatedServerPlan.price).toBeNull();
    });

    it('should have enterprise type', () => {
      expect(dedicatedServerPlan.type).toBe('enterprise');
    });

    it('should have label "Dedicated"', () => {
      expect(dedicatedServerPlan.label).toBe('Dedicated');
    });

    it('should have null outputs', () => {
      expect(dedicatedServerPlan.outputs).toBeNull();
    });
  });

  describe('applyMargin', () => {
    it('should return 50 credits for $0.15 (standard image generation)', () => {
      expect(applyMargin(0.15)).toBe(50);
    });

    it('should return 167 credits for $0.50 (video generation)', () => {
      expect(applyMargin(0.5)).toBe(167);
    });

    it('should return 2 credits for $0.001 (minimum floor kicks in for tiny costs)', () => {
      expect(applyMargin(0.001)).toBe(2);
    });

    it('should return 14 credits for $0.04 (typical FLUX Pro cost)', () => {
      expect(applyMargin(0.04)).toBe(14);
    });

    it('should return 2 credits for $0 (zero cost still returns minimum)', () => {
      expect(applyMargin(0)).toBe(2);
    });
  });
});

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
  getRuntimeMarginMultiplier,
  getScalePlan,
  INTERNAL_CREDIT_COSTS,
  setRuntimeMarginMultiplier,
  VIDEO_CREDIT_COSTS,
  websitePlans,
} from '@helpers/business/pricing/pricing.helper';
import { afterEach, describe, expect, it } from 'vitest';

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

    it('should have Pay As You Go, Hosted, Cloud Teams, Enterprise labels in order', () => {
      const labels = websitePlans.map((p) => p.label);
      expect(labels).toEqual([
        'Pay As You Go',
        'Hosted',
        'Cloud Teams',
        'Enterprise',
      ]);
    });

    it('should have correct plan types', () => {
      const types = websitePlans.map((p) => p.type);
      expect(types).toEqual([
        'payg',
        'subscription',
        'subscription',
        'enterprise',
      ]);
    });

    it('should have correct prices', () => {
      const prices = websitePlans.map((p) => p.price);
      expect(prices).toEqual([0, 49, 499, null]);
    });

    it('Pay As You Go plan should be free to join with no included credits', () => {
      const payg = websitePlans[0];
      expect(payg.outputs).toBeNull();
      expect(payg.price).toBe(0);
      expect(payg.includedCredits).toBeUndefined();
    });

    it('Hosted plan should be a subscription with included credits', () => {
      const hosted = websitePlans[1];
      expect(hosted.outputs).toBeNull();
      expect(hosted.interval).toBe('month');
      expect(hosted.includedCredits).toBe(8_000);
    });

    it('Cloud Teams plan should be B2B cloud with a shared credit pool', () => {
      const cloudTeams = websitePlans[2];
      expect(cloudTeams.outputs).toBeNull();
      expect(cloudTeams.includedCredits).toBe(80_000);
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

    it('should find Pay As You Go plan', () => {
      expect(getPlanByLabel('pay as you go')?.price).toBe(0);
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

    it('should expose launch pricing for the Hosted plan', () => {
      const plan = getHostedPlan();
      expect(plan.launchPrice).toBe(39);
      expect(plan.launchNote).toBe(
        'Launch pricing — first 12 months, then $49/month',
      );
    });

    it('should not mention any redemption cap or limit in the launch note', () => {
      const plan = getHostedPlan();
      const note = plan.launchNote?.toLowerCase() ?? '';
      expect(note).not.toMatch(/cap/);
      expect(note).not.toMatch(/limited/);
      expect(note).not.toMatch(/first \d+ (subscribers|customers|users)/);
    });
  });

  describe('launchPrice scoping', () => {
    it('should only set launchPrice on the Hosted plan', () => {
      const plansWithLaunchPrice = websitePlans.filter(
        (plan) => plan.launchPrice != null,
      );
      expect(plansWithLaunchPrice).toHaveLength(1);
      expect(plansWithLaunchPrice[0]?.label).toBe('Hosted');
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

    it('scales the sell price by an explicit margin multiplier', () => {
      // $0.15 base → 50 credits; ×1.2 → $0.60 → 60 credits.
      expect(applyMargin(0.15, 1.2)).toBe(60);
    });

    it('falls back to 1.0 for a non-positive or non-finite explicit multiplier', () => {
      expect(applyMargin(0.15, 0)).toBe(50);
      expect(applyMargin(0.15, -3)).toBe(50);
      expect(applyMargin(0.15, Number.NaN)).toBe(50);
    });
  });

  describe('runtime margin multiplier', () => {
    afterEach(() => {
      setRuntimeMarginMultiplier(1);
    });

    it('defaults to 1.0 (base margin only)', () => {
      expect(getRuntimeMarginMultiplier()).toBe(1);
      expect(applyMargin(0.15)).toBe(50);
    });

    it('applies the process-scoped multiplier to applyMargin by default', () => {
      setRuntimeMarginMultiplier(1.2);
      expect(getRuntimeMarginMultiplier()).toBe(1.2);
      expect(applyMargin(0.15)).toBe(60);
    });

    it('sanitizes non-positive or non-finite values to 1.0', () => {
      setRuntimeMarginMultiplier(0);
      expect(getRuntimeMarginMultiplier()).toBe(1);
      setRuntimeMarginMultiplier(-2);
      expect(getRuntimeMarginMultiplier()).toBe(1);
      setRuntimeMarginMultiplier(Number.NaN);
      expect(getRuntimeMarginMultiplier()).toBe(1);
    });

    it('lets an explicit argument override the runtime default', () => {
      setRuntimeMarginMultiplier(2);
      expect(applyMargin(0.15, 1)).toBe(50);
    });
  });
});

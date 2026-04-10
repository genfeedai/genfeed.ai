import {
  brandGenerateSchema,
  brandSchema,
} from '@genfeedai/client/schemas/core/brand.schema';
import { credentialSchema } from '@genfeedai/client/schemas/core/credential.schema';
import {
  knowledgeBaseSchema,
  knowledgeBrandingSchema,
  knowledgeSourceSchema,
} from '@genfeedai/client/schemas/core/knowledge-base.schema';
import {
  inviteMemberSchema,
  memberEditSchema,
} from '@genfeedai/client/schemas/core/member.schema';
import { organizationSchema } from '@genfeedai/client/schemas/core/organization.schema';
import { roleSchema } from '@genfeedai/client/schemas/core/role.schema';
import { subscriptionSchema } from '@genfeedai/client/schemas/core/subscription.schema';
import { describe, expect, it } from 'vitest';

describe('core schemas', () => {
  describe('brandSchema', () => {
    it('accepts valid brand', () => {
      expect(
        brandSchema.safeParse({ label: 'Test', slug: 'test' }).success,
      ).toBe(true);
    });

    it('rejects empty slug', () => {
      expect(brandSchema.safeParse({ label: 'Test', slug: '' }).success).toBe(
        false,
      );
    });

    it('rejects empty label', () => {
      expect(brandSchema.safeParse({ label: '', slug: 'test' }).success).toBe(
        false,
      );
    });

    it('accepts optional fields', () => {
      expect(
        brandSchema.safeParse({
          backgroundColor: '#fff',
          defaultImageModel: null,
          description: 'desc',
          isActive: true,
          label: 'L',
          slug: 'h',
        }).success,
      ).toBe(true);
    });
  });

  describe('brandGenerateSchema', () => {
    it('accepts valid prompt', () => {
      expect(
        brandGenerateSchema.safeParse({ prompt: 'Generate' }).success,
      ).toBe(true);
    });

    it('rejects empty prompt', () => {
      expect(brandGenerateSchema.safeParse({ prompt: '' }).success).toBe(false);
    });
  });

  describe('credentialSchema', () => {
    it('accepts empty object', () => {
      expect(credentialSchema.safeParse({}).success).toBe(true);
    });

    it('accepts optional fields', () => {
      expect(
        credentialSchema.safeParse({ description: 'D', label: 'L' }).success,
      ).toBe(true);
    });
  });

  describe('organizationSchema', () => {
    it('accepts valid label', () => {
      expect(organizationSchema.safeParse({ label: 'Org' }).success).toBe(true);
    });

    it('rejects empty label', () => {
      expect(organizationSchema.safeParse({ label: '' }).success).toBe(false);
    });
  });

  describe('roleSchema', () => {
    it('accepts valid role', () => {
      expect(
        roleSchema.safeParse({ key: 'admin', label: 'Admin' }).success,
      ).toBe(true);
    });

    it('rejects empty key', () => {
      expect(roleSchema.safeParse({ key: '', label: 'Admin' }).success).toBe(
        false,
      );
    });
  });

  describe('subscriptionSchema', () => {
    it('accepts valid amount', () => {
      expect(subscriptionSchema.safeParse({ amount: 10 }).success).toBe(true);
    });

    it('rejects zero amount', () => {
      expect(subscriptionSchema.safeParse({ amount: 0 }).success).toBe(false);
    });
  });

  describe('inviteMemberSchema', () => {
    it('accepts valid invite', () => {
      expect(
        inviteMemberSchema.safeParse({ email: 'a@b.com', role: 'admin' })
          .success,
      ).toBe(true);
    });

    it('rejects invalid email', () => {
      expect(
        inviteMemberSchema.safeParse({ email: 'bad', role: 'admin' }).success,
      ).toBe(false);
    });

    it('rejects empty role', () => {
      expect(
        inviteMemberSchema.safeParse({ email: 'a@b.com', role: '' }).success,
      ).toBe(false);
    });
  });

  describe('memberEditSchema', () => {
    it('accepts brands array', () => {
      expect(memberEditSchema.safeParse({ brands: ['b1'] }).success).toBe(true);
    });

    it('rejects empty brands', () => {
      expect(memberEditSchema.safeParse({ brands: [] }).success).toBe(false);
    });
  });

  describe('knowledgeBrandingSchema', () => {
    it('accepts empty object', () => {
      expect(knowledgeBrandingSchema.safeParse({}).success).toBe(true);
    });

    it('accepts full branding', () => {
      expect(
        knowledgeBrandingSchema.safeParse({
          audience: 'devs',
          hashtags: ['#ai'],
          taglines: ['tag'],
          tone: 'pro',
          values: ['v'],
          voice: 'friendly',
        }).success,
      ).toBe(true);
    });
  });

  describe('knowledgeSourceSchema', () => {
    it('accepts valid source', () => {
      expect(
        knowledgeSourceSchema.safeParse({
          category: 'url',
          label: 'Source',
          referenceUrl: 'https://example.com',
        }).success,
      ).toBe(true);
    });

    it('rejects invalid URL', () => {
      expect(
        knowledgeSourceSchema.safeParse({
          category: 'url',
          label: 'Source',
          referenceUrl: 'bad',
        }).success,
      ).toBe(false);
    });
  });

  describe('knowledgeBaseSchema', () => {
    it('accepts valid knowledge base', () => {
      expect(knowledgeBaseSchema.safeParse({ label: 'KB' }).success).toBe(true);
    });

    it('rejects empty label', () => {
      expect(knowledgeBaseSchema.safeParse({ label: '' }).success).toBe(false);
    });

    it('rejects label over 120 chars', () => {
      expect(
        knowledgeBaseSchema.safeParse({ label: 'x'.repeat(121) }).success,
      ).toBe(false);
    });
  });
});

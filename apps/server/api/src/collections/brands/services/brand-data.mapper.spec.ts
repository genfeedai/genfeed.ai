import type { BrandSetupDto } from '@api/endpoints/onboarding/dto/brand-setup.dto';
import type {
  LinkedInScrapedData,
  MergedBrandAnalysis,
  XProfileScrapedData,
} from '@api/services/brand-scraper/interfaces/brand-scraper.interfaces';
import type { IExtractedBrandData } from '@genfeedai/interfaces';
import { beforeEach, describe, expect, it } from 'vitest';
import { BrandDataMapper } from './brand-data.mapper';

describe('BrandDataMapper', () => {
  let mapper: BrandDataMapper;

  beforeEach(() => {
    mapper = new BrandDataMapper();
  });

  describe('buildScrapedBrandData', () => {
    it('fills the full IScrapedBrandData shape with defaults', () => {
      const scrapedAt = new Date('2026-01-01');

      const result = mapper.buildScrapedBrandData({
        scrapedAt,
        sourceUrl: 'https://example.com',
      });

      expect(result).toEqual({
        aboutText: undefined,
        companyName: undefined,
        description: undefined,
        fontFamily: undefined,
        heroText: undefined,
        logoUrl: undefined,
        metaDescription: undefined,
        ogImage: undefined,
        primaryColor: undefined,
        scrapedAt,
        secondaryColor: undefined,
        socialLinks: {},
        sourceUrl: 'https://example.com',
        tagline: undefined,
        valuePropositions: [],
      });
    });

    it('lets provided fields override the defaults', () => {
      const result = mapper.buildScrapedBrandData({
        companyName: 'Acme',
        scrapedAt: new Date('2026-01-01'),
        sourceUrl: 'https://acme.com',
        valuePropositions: ['fast'],
      });

      expect(result.companyName).toBe('Acme');
      expect(result.valuePropositions).toEqual(['fast']);
    });
  });

  describe('mapMergedSources', () => {
    it('maps the merged analysis and mirrors description into metaDescription', () => {
      const scrapedAt = new Date('2026-02-02');
      const merged = {
        aboutText: 'About us',
        companyName: 'Acme',
        contentSamples: [],
        description: 'We make anvils',
        fontFamily: 'Inter',
        heroText: 'Hero',
        logoUrl: 'https://acme.com/logo.png',
        primaryColor: '#111111',
        scrapedAt,
        secondaryColor: '#222222',
        socialLinks: { twitter: 'https://x.com/acme' },
        sourceUrls: ['https://acme.com'],
        tagline: 'Anvils for all',
        valuePropositions: ['durable'],
      } as MergedBrandAnalysis;

      const result = mapper.mapMergedSources(merged, 'https://acme.com');

      expect(result.metaDescription).toBe('We make anvils');
      expect(result.ogImage).toBeUndefined();
      expect(result.socialLinks).toEqual({ twitter: 'https://x.com/acme' });
      expect(result.sourceUrl).toBe('https://acme.com');
      expect(result.tagline).toBe('Anvils for all');
    });
  });

  describe('mapLinkedInData', () => {
    it('maps LinkedIn data with cover image as ogImage', () => {
      const scrapedAt = new Date('2026-02-02');
      const linkedinData = {
        companyName: 'Acme',
        coverImageUrl: 'https://cdn/cover.png',
        description: 'B2B anvils',
        logoUrl: 'https://cdn/logo.png',
        recentPosts: [],
        scrapedAt,
        sourceUrl: 'https://linkedin.com/company/acme',
      } as LinkedInScrapedData;

      const result = mapper.mapLinkedInData(
        linkedinData,
        'https://linkedin.com/company/acme',
      );

      expect(result.companyName).toBe('Acme');
      expect(result.metaDescription).toBe('B2B anvils');
      expect(result.ogImage).toBe('https://cdn/cover.png');
      expect(result.socialLinks).toEqual({});
      expect(result.valuePropositions).toEqual([]);
    });
  });

  describe('mapXProfileData', () => {
    it('maps X profile data with the profile image as logo and ogImage', () => {
      const scrapedAt = new Date('2026-02-02');
      const xData = {
        bio: 'Anvil maker',
        contentStyle: {
          contentTypes: [],
          usesEmojis: false,
          usesHashtags: false,
        },
        displayName: 'Acme',
        profileImageUrl: 'https://cdn/avatar.png',
        recentTweets: [],
        scrapedAt,
        sourceUrl: 'https://x.com/acme',
      } as XProfileScrapedData;

      const result = mapper.mapXProfileData(xData, 'https://x.com/acme');

      expect(result.companyName).toBe('Acme');
      expect(result.description).toBe('Anvil maker');
      expect(result.logoUrl).toBe('https://cdn/avatar.png');
      expect(result.ogImage).toBe('https://cdn/avatar.png');
    });
  });

  describe('buildFallbackScrapedData', () => {
    it('prefers the DTO brand name over the existing brand label', () => {
      const dto = {
        brandName: '  Acme  ',
        brandUrl: 'https://acme.com',
      } as BrandSetupDto;

      const result = mapper.buildFallbackScrapedData(dto, { label: 'Old' });

      expect(result.companyName).toBe('Acme');
      expect(result.sourceUrl).toBe('https://acme.com');
    });

    it('falls back to the existing brand label, then a generic name', () => {
      const dto = { brandUrl: 'https://acme.com' } as BrandSetupDto;

      expect(
        mapper.buildFallbackScrapedData(dto, { label: 'Existing' }).companyName,
      ).toBe('Existing');
      expect(
        mapper.buildFallbackScrapedData(dto, { label: null }).companyName,
      ).toBe('Brand');
    });
  });

  describe('readBrandAgentConfig', () => {
    it('returns an empty config for non-object values', () => {
      expect(mapper.readBrandAgentConfig(null)).toEqual({});
      expect(mapper.readBrandAgentConfig('nope')).toEqual({});
      expect(mapper.readBrandAgentConfig([1, 2])).toEqual({});
    });

    it('passes through object values', () => {
      const config = { persona: 'friendly' };

      expect(mapper.readBrandAgentConfig(config)).toBe(config);
    });
  });

  describe('readBrandReferenceImages', () => {
    it('returns an empty array for non-array values', () => {
      expect(mapper.readBrandReferenceImages(null)).toEqual([]);
      expect(mapper.readBrandReferenceImages({})).toEqual([]);
    });

    it('normalizes entries and drops non-object items', () => {
      const result = mapper.readBrandReferenceImages([
        { category: 'logo', isDefault: true, label: 'Logo', url: 'https://x' },
        { label: 42, url: 'https://y' },
        'garbage',
        null,
      ]);

      expect(result).toEqual([
        { category: 'logo', isDefault: true, label: 'Logo', url: 'https://x' },
        { category: 'reference', url: 'https://y' },
      ]);
    });
  });

  describe('buildPreviewPrompt', () => {
    it('builds an advertisement prompt for ads content', () => {
      const prompt = mapper.buildPreviewPrompt(
        'ads',
        'Acme',
        'anvils',
        '#111',
        '#222',
      );

      expect(prompt).toContain('advertisement for Acme');
      expect(prompt).toContain('#111 and #222');
    });

    it('builds a social media prompt for any other content type', () => {
      const prompt = mapper.buildPreviewPrompt(
        'social-post',
        'Acme',
        'anvils',
        '#111',
        '#222',
      );

      expect(prompt).toContain('social media content post for Acme');
    });
  });

  describe('parseAudienceList', () => {
    it('splits on commas, trims, and drops empties', () => {
      expect(mapper.parseAudienceList(' founders , , devs,')).toEqual([
        'founders',
        'devs',
      ]);
    });
  });

  describe('mergeExtractedVoice', () => {
    it('returns the config unchanged when no brand voice was extracted', () => {
      const config = { voice: { tone: 'calm' } };

      const result = mapper.mergeExtractedVoice(config, {
        scrapedAt: new Date(),
        sourceUrl: 'https://acme.com',
      } as IExtractedBrandData);

      expect(result).toEqual(config);
    });

    it('merges the extracted voice over the existing voice', () => {
      const config = {
        persona: 'friendly',
        voice: { audience: ['old'], tone: 'calm' },
      };
      const extractedData = {
        brandVoice: {
          audience: 'founders, devs',
          hashtags: ['#acme'],
          taglines: ['Anvils for all'],
          tone: 'bold',
          values: ['quality'],
          voice: 'confident',
        },
        scrapedAt: new Date(),
        sourceUrl: 'https://acme.com',
      } as IExtractedBrandData;

      const result = mapper.mergeExtractedVoice(config, extractedData);

      expect(result.persona).toBe('friendly');
      expect(result.voice).toEqual({
        audience: ['founders', 'devs'],
        doNotSoundLike: [],
        hashtags: ['#acme'],
        messagingPillars: [],
        sampleOutput: undefined,
        style: 'confident',
        taglines: ['Anvils for all'],
        tone: 'bold',
        values: ['quality'],
      });
    });

    it('keeps the existing audience when the extracted voice has none', () => {
      const config = { voice: { audience: ['old'] } };
      const extractedData = {
        brandVoice: {
          audience: '',
          hashtags: [],
          taglines: [],
          tone: 'bold',
          values: [],
          voice: 'confident',
        },
        scrapedAt: new Date(),
        sourceUrl: 'https://acme.com',
      } as IExtractedBrandData;

      const result = mapper.mergeExtractedVoice(config, extractedData);

      expect(result.voice?.audience).toEqual(['old']);
    });

    it('persists strategy topics and prompt seeds from the same analysis', () => {
      const prompting = {
        conversationStarters: [
          {
            id: 'brand-create-ai-workflows',
            intent: 'create' as const,
            label: 'Create AI workflows',
            prompt: 'Create three ideas about AI workflows.',
            topic: 'AI workflows',
          },
        ],
        seeds: [
          {
            angle: 'Practical guide',
            audience: 'founders',
            preferredFormats: ['post'],
            topic: 'AI workflows',
          },
        ],
      };

      const result = mapper.mergeExtractedVoice(
        { strategy: { platforms: ['linkedin'] } },
        {
          brandVoice: {
            audience: 'founders',
            goals: ['Increase qualified leads'],
            hashtags: [],
            prompting,
            taglines: [],
            tone: 'direct',
            topics: ['AI workflows'],
            values: [],
            voice: 'concise',
          },
          scrapedAt: new Date(),
          sourceUrl: 'https://acme.com',
        },
      );

      expect(result.prompting).toEqual(prompting);
      expect(result.strategy).toEqual({
        goals: ['Increase qualified leads'],
        platforms: ['linkedin'],
        topics: ['AI workflows'],
      });
    });
  });

  describe('mergeVoiceOverrides', () => {
    it('applies only the provided overrides on top of the existing voice', () => {
      const config = {
        voice: { style: 'plain', taglines: ['keep'], tone: 'calm' },
      };

      const result = mapper.mergeVoiceOverrides(config, {
        audience: 'founders, devs',
        tone: 'bold',
      });

      expect(result.voice).toEqual({
        audience: ['founders', 'devs'],
        style: 'plain',
        taglines: ['keep'],
        tone: 'bold',
      });
    });

    it('keeps the existing voice untouched when no overrides are provided', () => {
      const config = { voice: { tone: 'calm' } };

      const result = mapper.mergeVoiceOverrides(config, {});

      expect(result.voice).toEqual({ tone: 'calm' });
    });
  });
});

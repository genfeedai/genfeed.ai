import { describe, expect, it } from 'vitest';
import {
  CURATED_ACTION_CATALOG,
  isActionOnSurface,
  isPublishingApprovalRequired,
} from './curated-action-catalog';
import { SOURCE_TOOLS } from './source/index';
import { ALL_TOOLS, getToolByName, getToolsForSurface } from './tool-registry';

describe('curated action catalog', () => {
  it('is deterministically sorted with unique action names', () => {
    const names = CURATED_ACTION_CATALOG.map((entry) => entry.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(new Set(names).size).toBe(names.length);
  });

  it('declares a non-empty, duplicate-free surface set for every action', () => {
    for (const entry of CURATED_ACTION_CATALOG) {
      expect(entry.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(entry.surfaces.length).toBeGreaterThan(0);
      expect(new Set(entry.surfaces).size).toBe(entry.surfaces.length);
      expect(
        entry.surfaces.every(
          (surface) => surface === 'agent' || surface === 'mcp',
        ),
      ).toBe(true);
    }
  });

  it('has exactly one definition for every reviewed action and no extras', () => {
    const catalogNames = CURATED_ACTION_CATALOG.map((entry) => entry.name);
    const definitionNames = SOURCE_TOOLS.map((tool) => tool.name).sort((a, b) =>
      a.localeCompare(b),
    );

    expect(definitionNames).toEqual(catalogNames);
    expect(new Set(definitionNames).size).toBe(definitionNames.length);
  });

  it('derives runtime surfaces exclusively from the catalog', () => {
    expect(ALL_TOOLS).toHaveLength(CURATED_ACTION_CATALOG.length);

    for (const entry of CURATED_ACTION_CATALOG) {
      const tool = getToolByName(entry.name);
      expect(tool, entry.name).toBeDefined();
      expect(tool?.surfaces).toEqual({
        agent: isActionOnSurface(entry, 'agent'),
        cliAgentVisible: isActionOnSurface(entry, 'agent'),
        mcp: isActionOnSurface(entry, 'mcp'),
      });
    }
  });

  it('lists exactly the cataloged actions on each runtime surface', () => {
    for (const surface of ['agent', 'mcp'] as const) {
      const expected = CURATED_ACTION_CATALOG.filter((entry) =>
        isActionOnSurface(entry, surface),
      ).map((entry) => entry.name);
      const actual = getToolsForSurface(surface).map((tool) => tool.name);
      expect(actual).toEqual(expected);
    }
  });

  it('contains no generated endpoint mirrors', () => {
    expect(ALL_TOOLS.some((tool) => tool.name.includes('__'))).toBe(false);
  });

  it('owns the exact reviewed set of publishing approval actions', () => {
    expect(
      CURATED_ACTION_CATALOG.filter(isPublishingApprovalRequired).map(
        (entry) => entry.name,
      ),
    ).toEqual([
      'approve_social_draft',
      'control_scheduled_release',
      'create_post',
      'create_scheduled_release',
      'post_social_reply',
      'send_social_dm',
      'update_scheduled_release',
    ]);
  });

  it('reviews the agent-only ad remix, brand voice, and workflow input actions', () => {
    for (const name of [
      'draft_brand_voice_profile',
      'generate_ad_pack',
      'get_workflow_inputs',
      'prepare_ad_launch_review',
      'save_brand_voice_profile',
    ]) {
      const tool = getToolByName(name);
      expect(tool, name).toBeDefined();
      expect(tool?.surfaces, name).toMatchObject({ agent: true, mcp: false });
      expect(tool?.description.length, name).toBeGreaterThan(0);
    }
  });

  it('keeps the ad remix schemas selectable and the launch draft review-only', () => {
    const adPack = getToolByName('generate_ad_pack');
    const launchReview = getToolByName('prepare_ad_launch_review');

    expect(adPack?.parameters.required).toEqual(['adId', 'source']);
    expect(launchReview?.parameters.required).toEqual(['adId', 'source']);
    expect(launchReview?.parameters.properties).toHaveProperty('dailyBudget');
    expect(launchReview?.description).toContain('never publishes live');
  });

  it('prices the brand voice draft and leaves the save free', () => {
    expect(getToolByName('draft_brand_voice_profile')?.creditCost).toBe(1);
    expect(getToolByName('save_brand_voice_profile')?.creditCost).toBe(0);
    expect(
      getToolByName('save_brand_voice_profile')?.parameters.required,
    ).toEqual(['voiceProfile']);
  });

  it('exposes the reviewed generation, edit, and analytics actions on both surfaces', () => {
    for (const name of [
      'analyze_performance',
      'generate_voice',
      'get_analytics',
      'get_content_calendar',
      'reframe_image',
      'upscale_image',
    ]) {
      expect(getToolByName(name)?.surfaces, name).toMatchObject({
        agent: true,
        mcp: true,
      });
    }
  });

  it('exposes headless-safe X read actions on both surfaces and keeps drafts agent-only', () => {
    for (const name of [
      'fetch_x_post',
      'list_x_account_activity',
      'search_x_posts',
    ]) {
      expect(getToolByName(name)?.surfaces, name).toMatchObject({
        agent: true,
        mcp: true,
      });
      expect(getToolByName(name)?.creditCost, name).toBe(1);
    }

    for (const name of ['draft_x_quote', 'draft_x_repost']) {
      expect(getToolByName(name)?.surfaces, name).toMatchObject({
        agent: true,
        mcp: false,
      });
    }
  });

  it('keeps in-product guided flows on the agent surface only', () => {
    // Deliberate boundaries — see `.agents/memory/curated_action_surface_boundaries.md`.
    for (const name of [
      'create_brand',
      'get_outreach_sequence_analytics',
      'prepare_voice_clone',
      'rename_brand',
      'schedule_post',
    ]) {
      expect(getToolByName(name)?.surfaces, name).toMatchObject({
        agent: true,
        mcp: false,
      });
    }
  });

  it('describes brand identity mutations as confirmation-card actions', () => {
    for (const name of ['create_brand', 'rename_brand']) {
      const tool = getToolByName(name);
      expect(tool?.creditCost, name).toBe(0);
      expect(tool?.uiActionType, name).toBe('brand_identity_confirmation_card');
    }

    expect(getToolByName('rename_brand')?.parameters.required).toEqual([
      'label',
    ]);
  });

  it('keeps per-account ad performance reporting on the MCP surface only', () => {
    const adsReportingTools = ALL_TOOLS.filter(
      (tool) =>
        tool.name.startsWith('list_meta_') ||
        tool.name.startsWith('get_meta_') ||
        tool.name.startsWith('compare_meta_') ||
        tool.name.startsWith('list_google_ads_') ||
        tool.name.startsWith('get_google_ads_'),
    );

    expect(adsReportingTools).toHaveLength(14);
    for (const tool of adsReportingTools) {
      expect(tool.surfaces, tool.name).toMatchObject({
        agent: false,
        mcp: true,
      });
    }
  });

  it('exposes read-only scheduler capability discovery on MCP only', () => {
    for (const name of [
      'get_scheduler_capability',
      'list_brand_publishing_readiness',
      'list_scheduler_capabilities',
      'validate_scheduler_target',
    ]) {
      const tool = getToolByName(name);
      const entry = CURATED_ACTION_CATALOG.find(
        (candidate) => candidate.name === name,
      );
      expect(tool, name).toBeDefined();
      expect(entry, name).toBeDefined();
      expect(tool?.surfaces, name).toMatchObject({ agent: false, mcp: true });
      expect(tool?.creditCost, name).toBe(0);
      expect(entry && isPublishingApprovalRequired(entry), name).toBe(false);
    }

    expect(
      getToolByName('list_brand_publishing_readiness')?.parameters.required,
    ).toEqual(['brandId']);
    expect(
      getToolByName('list_scheduler_capabilities')?.parameters.properties,
    ).toEqual(
      expect.objectContaining({
        includeHidden: expect.objectContaining({ type: 'boolean' }),
        includePlanned: expect.objectContaining({ type: 'boolean' }),
      }),
    );
    expect(
      getToolByName('get_scheduler_capability')?.parameters.required,
    ).toEqual(['platform']);
    expect(
      getToolByName('validate_scheduler_target')?.parameters.required,
    ).toEqual(['platform']);
    expect(
      Object.keys(
        getToolByName('validate_scheduler_target')?.parameters.properties ?? {},
      ).sort(),
    ).toEqual([
      'caption',
      'credentialId',
      'media',
      'platform',
      'publishMode',
      'settings',
      'visibility',
    ]);
  });

  it('publishes Instagram inspiration and review-only remix schemas on both surfaces', () => {
    const listTool = getToolByName('list_instagram_inspiration');
    const remixTool = getToolByName('create_instagram_remix_workflow');

    expect(listTool?.surfaces).toMatchObject({ agent: true, mcp: true });
    expect(listTool?.parameters.properties).toHaveProperty('brandId');
    expect(remixTool?.surfaces).toMatchObject({ agent: true, mcp: true });
    expect(remixTool?.parameters.required).toEqual(['username', 'shortcode']);
    expect(remixTool?.description).toContain('review-only');

    for (const name of [
      'list_ads_research',
      'get_ad_research_detail',
      'create_ad_remix_workflow',
    ]) {
      expect(getToolByName(name)?.surfaces).toMatchObject({
        agent: true,
        mcp: true,
      });
    }
  });
});

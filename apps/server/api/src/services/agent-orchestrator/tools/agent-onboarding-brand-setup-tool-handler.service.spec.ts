import { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AgentOnboardingBrandSetupToolHandler } from '@api/services/agent-orchestrator/tools/agent-onboarding-brand-setup-tool-handler.service';
import {
  type AgentToolDispatchHandlers,
  dispatchRegisteredAgentTool,
} from '@api/services/agent-orchestrator/tools/agent-tool-dispatch.routes';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { BadRequestException, RequestTimeoutException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const CONTEXT: ToolExecutionContext = {
  organizationId: 'organization-1',
  userId: 'user-1',
};

function createHandler(options?: { brand?: Record<string, unknown> }) {
  const brandsService = {
    findOne: vi.fn().mockResolvedValue(options?.brand ?? null),
    updateAgentConfig: vi.fn().mockResolvedValue({ id: 'brand-1' }),
  };
  const signupPrefillService = { scanBrandUrl: vi.fn() };
  const loggerService = { error: vi.fn(), warn: vi.fn() };
  const handler = new AgentOnboardingBrandSetupToolHandler(
    loggerService as never,
    brandsService as never,
    new BrandDataMapper(),
    signupPrefillService as never,
  );
  return { handler, brandsService, signupPrefillService, loggerService };
}

describe('saveOnboardingAnswers', () => {
  it('merges supplied strategy answers and tone while preserving other keys', async () => {
    const { handler, brandsService } = createHandler({
      brand: {
        id: 'brand-1',
        agentConfig: {
          persona: 'Founder',
          strategy: {
            goals: ['Old goal'],
            platforms: ['x'],
            frequency: 'daily',
            topics: ['AI'],
          },
          voice: { tone: 'Formal', style: 'Concise', bannedPhrases: ['hype'] },
        },
      },
    });
    const result = await handler.execute(
      'save_onboarding_answers',
      {
        goals: [' Awareness '],
        platforms: ['linkedin'],
        cadence: 'weekly',
        toneAdjustment: 'Friendly',
      },
      { ...CONTEXT, brandId: 'brand-1' },
    );
    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: 'brand-1',
      organizationId: CONTEXT.organizationId,
      isDeleted: false,
    });
    expect(brandsService.updateAgentConfig).toHaveBeenCalledWith(
      'brand-1',
      CONTEXT.organizationId,
      {
        strategy: {
          goals: ['Awareness'],
          platforms: ['linkedin'],
          frequency: 'weekly',
          topics: ['AI'],
        },
        voice: { tone: 'Friendly', style: 'Concise', bannedPhrases: ['hype'] },
      },
    );
    expect(result).toMatchObject({
      success: true,
      creditsUsed: 0,
      data: { brandId: 'brand-1' },
    });
  });

  it('preserves omitted answers and does not rewrite other config sections', async () => {
    const { handler, brandsService } = createHandler({
      brand: {
        agentConfig: {
          strategy: { goals: ['Keep'], topics: ['AI'] },
          voice: { tone: 'Keep' },
          schedule: { timezone: 'UTC' },
        },
      },
    });
    await handler.saveOnboardingAnswers(
      { platforms: [] },
      { ...CONTEXT, brandId: 'brand-1' },
    );
    expect(brandsService.updateAgentConfig).toHaveBeenCalledWith(
      'brand-1',
      CONTEXT.organizationId,
      {
        strategy: { goals: ['Keep'], topics: ['AI'], platforms: [] },
      },
    );
  });

  it.each([
    { goals: Array(11).fill('goal') },
    { platforms: [null] },
    { goals: [' '] },
    { cadence: 'x'.repeat(201) },
    { toneAdjustment: 42 },
    { brandId: 42 },
  ])('rejects malformed or oversized answers %j', async (params) => {
    const { handler, brandsService } = createHandler();
    await expect(
      handler.saveOnboardingAnswers(params, { ...CONTEXT, brandId: 'brand-1' }),
    ).rejects.toThrow();
    expect(brandsService.updateAgentConfig).not.toHaveBeenCalled();
  });

  it('rejects a brand outside the current thread', async () => {
    const { handler, brandsService } = createHandler();
    await expect(
      handler.saveOnboardingAnswers(
        { brandId: 'other' },
        { ...CONTEXT, brandId: 'brand-1' },
      ),
    ).rejects.toThrow();
    expect(brandsService.findOne).not.toHaveBeenCalled();
  });

  it('rejects unavailable foreign or deleted brands and a missing current brand', async () => {
    const { handler, brandsService } = createHandler();
    await expect(
      handler.saveOnboardingAnswers({ brandId: 'foreign' }, CONTEXT),
    ).rejects.toThrow('not available');
    await expect(handler.saveOnboardingAnswers({}, CONTEXT)).rejects.toThrow(
      'current brand',
    );
    expect(brandsService.updateAgentConfig).not.toHaveBeenCalled();
  });
});

describe('scan_brand_url', () => {
  it('returns a compact summary and an existing card with the discovered logo and colors', async () => {
    const h = createHandler();
    h.signupPrefillService.scanBrandUrl.mockResolvedValue({
      scrapeStatus: 'scraped',
      status: 'completed',
      summary: {
        name: 'Acme',
        description: 'Tools for makers',
        tone: 'Friendly',
        primaryColor: '#123456',
        secondaryColor: '#654321',
        logoUrl: 'https://acme.example/logo.png',
      },
    });
    const result = await h.handler.execute(
      'scan_brand_url',
      { url: 'acme.example/product' },
      { ...CONTEXT, brandId: 'brand-1' },
    );
    expect(h.signupPrefillService.scanBrandUrl).toHaveBeenCalledWith(
      {
        brandId: 'brand-1',
        organizationId: 'organization-1',
        userId: 'user-1',
      },
      'https://acme.example/product',
    );
    expect(result).toMatchObject({
      success: true,
      creditsUsed: 0,
      data: {
        status: 'scanned',
        sourceUrl: 'https://acme.example/product',
        brandId: 'brand-1',
        summary: { name: 'Acme' },
      },
      nextActions: [
        {
          type: 'completion_summary_card',
          title: 'Acme',
          outcomeBullets: [
            'Primary color: #123456',
            'Secondary color: #654321',
            'Tone: Friendly',
          ],
          outputVariants: [
            { kind: 'image', url: 'https://acme.example/logo.png' },
          ],
        },
      ],
    });
  });

  it('reports scrape failure as an agent-readable choice point', async () => {
    const h = createHandler();
    h.signupPrefillService.scanBrandUrl.mockResolvedValue({
      scrapeStatus: 'failed',
      scrapeReason: 'scrape_failed',
    });
    expect(
      await h.handler.scanBrandUrl(
        { url: 'https://acme.example' },
        { ...CONTEXT, brandId: 'brand-1' },
      ),
    ).toMatchObject({
      success: true,
      data: { status: 'failed', reason: 'scrape_failed' },
    });
  });

  it.each([
    [new RequestTimeoutException('secret'), 'timeout'],
    [new NotFoundException('secret'), 'brand_not_found'],
    [new BadRequestException('secret'), 'invalid_url'],
    [new Error('secret'), 'scan_failed'],
    ['secret', 'scan_failed'],
  ])('sanitizes %s into %s', async (error, reason) => {
    const h = createHandler();
    h.signupPrefillService.scanBrandUrl.mockRejectedValue(error);
    const result = await h.handler.scanBrandUrl(
      { url: 'https://acme.example' },
      { ...CONTEXT, brandId: 'brand-1' },
    );
    expect(result).toMatchObject({
      success: true,
      data: { status: 'failed', reason },
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(h.loggerService.warn).toHaveBeenCalledWith(
      'Onboarding brand scan failed',
      {
        brandId: 'brand-1',
        error: error instanceof Error ? error.message : String(error),
        organizationId: CONTEXT.organizationId,
        sourceUrl: 'https://acme.example/',
      },
    );
  });

  it('rejects a different thread brand before invoking prefill', async () => {
    const h = createHandler();
    const result = await h.handler.scanBrandUrl(
      { url: 'https://acme.example', brandId: 'foreign-brand' },
      { ...CONTEXT, brandId: 'brand-1' },
    );
    expect(result).toMatchObject({
      success: true,
      data: { status: 'failed', reason: 'brand_not_found' },
    });
    expect(h.signupPrefillService.scanBrandUrl).not.toHaveBeenCalled();
  });
});

describe('brand setup dispatch', () => {
  it.each(['scan_brand_url', 'save_onboarding_answers'] as const)(
    'routes %s to the focused handler',
    async (toolName) => {
      const execute = vi
        .fn()
        .mockResolvedValue({ success: true, creditsUsed: 0 });
      const handlers = {
        onboardingBrandSetupHandler: { execute },
      } as unknown as AgentToolDispatchHandlers;
      const params = { brandId: 'brand-1' };
      expect(
        await dispatchRegisteredAgentTool(handlers, toolName, params, CONTEXT),
      ).toEqual({ success: true, creditsUsed: 0 });
      expect(execute).toHaveBeenCalledWith(toolName, params, CONTEXT);
    },
  );
});

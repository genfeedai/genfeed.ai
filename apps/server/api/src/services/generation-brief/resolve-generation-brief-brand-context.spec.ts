import {
  resolveGenerationBriefBrandContext,
  resolveIsGenerationBriefBrandVoiceOn,
} from '@api/services/generation-brief/resolve-generation-brief-brand-context';
import { describe, expect, it, vi } from 'vitest';

function buildTemplatesService(
  overrides: { content?: string | null; isActive?: boolean } = {},
) {
  const { content = 'Brand voice: {{brandName}}', isActive = true } = overrides;
  return {
    getPromptByKey: vi
      .fn()
      .mockResolvedValue(content === null ? null : { content, isActive }),
    renderPrompt: vi
      .fn()
      .mockImplementation(
        (template: string, variables: Record<string, unknown>) =>
          template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
            String(variables[key] ?? ''),
          ),
      ),
  };
}

describe('resolveIsGenerationBriefBrandVoiceOn', () => {
  it('is on for brandingMode "brand"', () => {
    expect(
      resolveIsGenerationBriefBrandVoiceOn({ brandingMode: 'brand' }),
    ).toBe(true);
  });

  it('is on for the legacy isBrandingEnabled flag when brandingMode is unset', () => {
    expect(
      resolveIsGenerationBriefBrandVoiceOn({ isBrandingEnabled: true }),
    ).toBe(true);
  });

  it('is off when brandingMode is "off", even if isBrandingEnabled is true', () => {
    expect(
      resolveIsGenerationBriefBrandVoiceOn({
        brandingMode: 'off',
        isBrandingEnabled: true,
      }),
    ).toBe(false);
  });

  it('is off when neither flag is set', () => {
    expect(resolveIsGenerationBriefBrandVoiceOn({})).toBe(false);
  });
});

describe('resolveGenerationBriefBrandContext', () => {
  it('renders the shared system.brand-context template with brand variables', async () => {
    const templatesService = buildTemplatesService();

    const result = await resolveGenerationBriefBrandContext({
      brand: { label: 'Acme' },
      branding: { tone: 'confident' },
      organizationId: 'org-1',
      templatesService: templatesService as never,
    });

    expect(templatesService.getPromptByKey).toHaveBeenCalledWith(
      'system.brand-context',
      'org-1',
    );
    expect(result).toBe('Brand voice: Acme');
  });

  it('returns undefined when the brand has no label', async () => {
    const templatesService = buildTemplatesService();

    const result = await resolveGenerationBriefBrandContext({
      brand: {},
      templatesService: templatesService as never,
    });

    expect(result).toBeUndefined();
    expect(templatesService.getPromptByKey).not.toHaveBeenCalled();
  });

  it('degrades to undefined when the template is missing, mirroring PromptBuilderService.buildBrandContext', async () => {
    const templatesService = buildTemplatesService({ content: null });

    const result = await resolveGenerationBriefBrandContext({
      brand: { label: 'Acme' },
      templatesService: templatesService as never,
    });

    expect(result).toBeUndefined();
  });

  it('degrades to undefined when the template is inactive', async () => {
    const templatesService = buildTemplatesService({ isActive: false });

    const result = await resolveGenerationBriefBrandContext({
      brand: { label: 'Acme' },
      templatesService: templatesService as never,
    });

    expect(result).toBeUndefined();
  });

  it('truncates an unusually long rendered template as a defensive margin', async () => {
    const longTone = 'x'.repeat(1000);
    const templatesService = buildTemplatesService({
      content: '{{brandTone}}',
    });

    const result = await resolveGenerationBriefBrandContext({
      brand: { label: 'Acme' },
      branding: { tone: longTone },
      templatesService: templatesService as never,
    });

    expect(result?.length).toBeLessThanOrEqual(500);
    expect(result?.endsWith('…')).toBe(true);
  });
});

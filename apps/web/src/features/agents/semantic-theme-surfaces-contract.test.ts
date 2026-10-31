import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const AGENTS_ROOT = import.meta.dirname;

function readAgents(relativePath: string): string {
  return readFileSync(join(AGENTS_ROOT, relativePath), 'utf8');
}

describe('agents semantic theme surfaces', () => {
  it('themes the campaigns loading indicator', () => {
    const campaigns = readAgents('campaigns/AgentCampaignsPage.tsx');

    expect(campaigns).toContain('bg-foreground/5');
    expect(campaigns).not.toContain('border-white');
    expect(campaigns).not.toContain('bg-white');
  });

  it('themes campaign controls and platform icons', () => {
    const table = readAgents('campaigns/OutreachCampaignsTable.tsx');
    const header = readAgents('campaigns/OutreachCampaignDetailHeader.tsx');
    const wizard = readAgents('campaigns/OutreachCampaignWizardStep1.tsx');

    expect(table).not.toContain('text-slate');
    expect(header).not.toContain('text-slate');
    expect(wizard).toContain('border-border');
    expect(wizard).not.toContain('border-white');
  });

  it('uses the shared Card for the campaigns surface', () => {
    const source = readAgents('campaigns/AgentCampaignsPage.tsx');

    expect(source).toContain("import Card from '@ui/card/Card'");
    expect(source).toContain('<Card');
  });
});

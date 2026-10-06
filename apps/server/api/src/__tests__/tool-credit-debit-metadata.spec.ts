import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getToolByName, isSpendingCreditPricing } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';

/**
 * A handler file that calls the credit debit path must name catalog tools
 * whose metadata says they spend. Infrastructure that debits outside a tool
 * stays on the allowlist.
 */
const API_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEBIT_CALL = /(?:deductCreditsFromOrganization|settleReservation)\(/;

const ALLOWED_FILES = new Set([
  'agent-llm-round-reservation.util.ts',
  'agent-turn-round-runner.service.ts',
  'batch-project-credits.service.ts',
  'credits.utils.service.ts',
  'evaluations.service.ts',
  'expert-first-system.service.ts',
  'generation-quote-group.service.ts',
  'knowledge-transcript-ingest.service.ts',
  'live-session-credits.service.ts',
  'managed-inference.service.ts',
  'master-prompt-generator.service.ts',
  'onboarding-preview.service.ts',
  'oss-credits-utils.service.ts',
  'posting-cadence-copy.service.ts',
  'referrals.service.ts',
  'reply-generation.service.ts',
  'voice-credits.service.ts',
  'workflow-generation-billing.service.ts',
  'workflow-trend-publish-executor-registrar.service.ts',
]);

const TOOLS_BY_FILE: Record<string, readonly string[]> = {
  'agent-generation-settings-tool-handler.service.ts': ['enhance_prompt'],
  'agent-media-text-generation.service.ts': ['generate_content'],
  'agent-publish-tool-handler.service.ts': ['repurpose_post'],
  'agent-x-actions-tool-handler.service.ts': [
    'get_x_posts',
    'list_x_account_activity',
  ],
  'batch-generation-credits.service.ts': ['generate_content_batch'],
  'brand-from-url.service.ts': ['create_brand_from_url'],
  'brand-interview.service.ts': ['start_brand_interview'],
  'brand-remix-run-execution.service.ts': ['start_remix_generation'],
  'brand-remix-scene-billing.service.ts': ['start_remix_generation'],
  'video-generation-credits.service.ts': ['generate'],
  'visual-project-billing.service.ts': [
    'export_visual_code_project',
    'generate_visual_code',
    'retry_visual_code_project',
    'revise_visual_code_project',
  ],
};

function collectSources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSources(full, found);
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) found.push(full);
  }
  return found;
}

describe('tool credit debit metadata', () => {
  it('requires spending metadata for every handler that can debit', () => {
    const unexpected: string[] = [];
    const underpriced: string[] = [];
    for (const file of collectSources(API_SRC)) {
      if (!DEBIT_CALL.test(readFileSync(file, 'utf8'))) continue;
      const base = file.split('/').pop() ?? file;
      if (ALLOWED_FILES.has(base)) continue;
      const tools = TOOLS_BY_FILE[base];
      if (!tools) {
        unexpected.push(relative(API_SRC, file));
        continue;
      }
      for (const name of tools) {
        const tool = getToolByName(name);
        if (
          !tool?.creditPricing ||
          !isSpendingCreditPricing(tool.creditPricing, tool.creditCost)
        ) {
          underpriced.push(name);
        }
      }
    }
    expect(unexpected).toEqual([]);
    expect(underpriced).toEqual([]);
  });
});

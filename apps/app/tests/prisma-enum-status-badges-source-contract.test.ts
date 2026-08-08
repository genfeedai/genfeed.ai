import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Prisma-enum-backed statuses reach the client as SCREAMING_SNAKE labels.
 * A badge map keyed on lowercase product language type-checks fine and silently
 * falls through to its default for every row — the failure is invisible until
 * someone looks at the page. These contracts pin the enum-keyed spellings.
 *
 * String-column statuses (posts, workflows, campaigns) keep lowercase product
 * language on purpose and are deliberately not covered here.
 *
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
function readAppSource(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Prisma-enum status badge source contracts', () => {
  it('keys the admin bot badge off BotStatus, not lowercase literals', () => {
    const source = readAppSource(
      'app/(protected)/admin/automation/bots/bots-page.tsx',
    );

    expect(source).toMatch(
      /import \{[^}]*BotStatus[^}]*\} from '@genfeedai\/enums'/,
    );
    expect(source).toContain('case BotStatus.ACTIVE:');
    expect(source).toContain('case BotStatus.PAUSED:');
    expect(source).not.toContain("case 'active':");
    expect(source).not.toContain("case 'paused':");
  });

  it('keys the agent run badge off AgentRunStatus, not lowercase literals', () => {
    const source = readAppSource(
      'app/(protected)/[orgSlug]/[brandSlug]/automate/[agentId]/AgentRunRow.tsx',
    );

    expect(source).toContain('[AgentRunStatus.COMPLETED]:');
    expect(source).toContain('[AgentRunStatus.FAILED]:');
    expect(source).toContain('[AgentRunStatus.BUDGET_EXHAUSTED]:');
    expect(source).not.toContain('completed:');
    expect(source).not.toContain('budget_exhausted:');
  });

  it('normalizes run content statuses across both vocabularies', () => {
    const source = readAppSource(
      'app/(protected)/[orgSlug]/[brandSlug]/automate/[agentId]/AgentRunContentGrid.tsx',
    );

    // A run mixes posts (lowercase String column) with ingredients (SCREAMING
    // Prisma enum). The landed design keys one lowercase map and normalizes
    // the lookup — without the toLowerCase() every ingredient status silently
    // falls through to the default variant.
    expect(source).toContain('status.toLowerCase()');
    expect(source).toContain("failed: 'error'");
    expect(source).toContain("generated: 'success'");
    expect(source).toContain("published: 'success'");
    expect(source).toContain("scheduled: 'warning'");
  });
});

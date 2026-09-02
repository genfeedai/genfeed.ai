import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BotStatus } from '@genfeedai/contracts';
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
    // STOPPED is a deliberate terminal state, not a failure. Without an
    // explicit case it falls through to the `error` default and paints a
    // normally-stopped bot as broken — a mapping that reads as "working" but
    // renders the wrong badge, which no other assertion here would catch.
    expect(source).toContain('case BotStatus.STOPPED:');
    expect(source).not.toContain("case 'active':");
    expect(source).not.toContain("case 'paused':");
    expect(source).not.toContain("case 'stopped':");
  });

  it('maps every BotStatus member, so a new member cannot render as a failure', () => {
    const source = readAppSource(
      'app/(protected)/admin/automation/bots/bots-page.tsx',
    );

    for (const member of Object.keys(BotStatus)) {
      expect(source).toContain(`case BotStatus.${member}:`);
    }
  });
});

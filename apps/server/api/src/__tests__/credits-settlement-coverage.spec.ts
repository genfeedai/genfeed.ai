import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard for the unsettled-reservation bug class.
 *
 * `CreditsGuard` RESERVES a request's credits before provider work starts and
 * hangs the reservation id on `request.creditsConfig`. Nothing else settles it:
 * `CreditsInterceptor` is the only code that queues the deduction on success and
 * releases the hold on failure. A route that carries `@Credits(...)` without
 * `@UseInterceptors(CreditsInterceptor)` therefore reserves credits that are
 * never charged and never released, so the customer's balance stays blocked for
 * the reservation's eight-day TTL and the work is never billed.
 *
 * `MusicsOperationsController.create` and `AvatarVideoController.createAvatarVideo`
 * shipped in exactly that state. Both were only reachable through the agent's
 * HTTP loopback, whose try/catch hid the missing charge. This test makes the
 * pairing structural instead of a thing every reviewer has to remember.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const API_SRC = join(HERE, '..');

const CREDITS_DECORATOR = /^\s*@Credits\(/;
const INTERCEPTOR_DECORATOR = /@UseInterceptors\([^)]*CreditsInterceptor/;
const MEMBER_START =
  /^ {2}(?:public |private |protected )?(?:async )?[A-Za-z_]\w*\s*[(<]/;

function collectControllerFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectControllerFiles(full, found);
    } else if (entry.endsWith('.controller.ts')) {
      found.push(full);
    }
  }
  return found;
}

function countUnbalanced(line: string): number {
  let depth = 0;
  for (const char of line) {
    if (char === '(' || char === '{' || char === '[') depth += 1;
    if (char === ')' || char === '}' || char === ']') depth -= 1;
  }
  return depth;
}

/**
 * Return the decorator text attached to every class member, keyed by member
 * name. Decorators are matched at the class-member indentation Biome enforces,
 * and multi-line decorators are folded in by bracket depth.
 */
function readMemberDecorators(source: string): Map<string, string> {
  const byMember = new Map<string, string>();
  let pending: string[] = [];
  let depth = 0;

  for (const line of source.split('\n')) {
    if (depth > 0) {
      pending.push(line);
      depth += countUnbalanced(line);
      continue;
    }
    if (/^ {2}@/.test(line)) {
      pending.push(line);
      depth += countUnbalanced(line);
      continue;
    }
    const member = line.match(MEMBER_START);
    if (member) {
      const name = member[0]
        .trim()
        .replace(/^(?:public |private |protected )/, '');
      byMember.set(
        name.replace(/^async /, '').replace(/\s*[(<]$/, ''),
        pending.join('\n'),
      );
    }
    pending = [];
  }
  return byMember;
}

describe('credits settlement coverage', () => {
  it('pairs every @Credits route with the CreditsInterceptor that settles it', () => {
    const offenders: string[] = [];

    for (const file of collectControllerFiles(API_SRC)) {
      const source = readFileSync(file, 'utf8');
      if (!CREDITS_DECORATOR.test(source.split('\n').join('\n'))) continue;
      if (!source.includes('@Credits(')) continue;

      const classDecorators = source.slice(0, source.indexOf('export class'));
      if (INTERCEPTOR_DECORATOR.test(classDecorators)) continue;

      for (const [member, decorators] of readMemberDecorators(source)) {
        if (!decorators.includes('@Credits(')) continue;
        if (INTERCEPTOR_DECORATOR.test(decorators)) continue;
        offenders.push(`${relative(API_SRC, file)}#${member}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('instrumentation-client', () => {
  it('drops raw JSON:API object rejections before send', () => {
    const source = readFileSync(
      join(process.cwd(), 'instrumentation-client.ts'),
      'utf8',
    );

    expect(source).toContain('dropUnhandledJsonApiObjectRejection');
    expect(source).toContain('beforeSend(event, hint)');
  });
});

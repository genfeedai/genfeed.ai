import { describe, expect, it } from 'vitest';
import { articleCommand } from '@/commands/generate/article';
import { articleXCommand } from '@/commands/generate/article-x';

describe('article generation option bounds', () => {
  it.each(['0', '5'])('rejects standard article count %s', (count) => {
    expect(() => articleCommand.parseOptions(['--count', count])).toThrow('between 1 and 4');
  });

  it.each(['2499', '10001'])('rejects X article word count %s', (words) => {
    expect(() => articleXCommand.parseOptions(['--words', words])).toThrow(
      'between 2500 and 10000'
    );
  });
});

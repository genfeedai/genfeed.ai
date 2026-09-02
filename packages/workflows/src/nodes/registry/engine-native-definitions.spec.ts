import { describe, expect, it } from 'vitest';
import { ENGINE_NATIVE_NODE_DEFINITIONS } from './engine-native-definitions';

describe('ENGINE_NATIVE_NODE_DEFINITIONS', () => {
  it('hand-authors only engine primitives and the action envelope', () => {
    expect(Object.keys(ENGINE_NATIVE_NODE_DEFINITIONS).sort()).toEqual([
      'commentTrigger',
      'engagementTrigger',
      'genfeedAction',
      'keywordTrigger',
    ]);
  });

  it('keeps comment trigger outputs for downstream automation', () => {
    expect(
      ENGINE_NATIVE_NODE_DEFINITIONS.commentTrigger.outputs.map(
        (output) => output.id,
      ),
    ).toEqual([
      'commentId',
      'contentId',
      'contentUrl',
      'text',
      'authorId',
      'authorUsername',
      'platform',
    ]);
  });
});

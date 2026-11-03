import { describe, expect, it } from 'vitest';
import { getSocialInboxActionContract } from './social-inbox-action-contracts';

describe('social inbox sync action contracts', () => {
  it('lets the YouTube comment sync return per-post failures and scan counts', () => {
    const outputSchema = getSocialInboxActionContract(
      'social.inbox.sync.youtube-comments',
    )?.outputSchema;

    expect(outputSchema).toMatchObject({
      additionalProperties: false,
      properties: {
        commentsSeen: { type: 'integer' },
        conversationsCreated: { type: 'integer' },
        credentialsScanned: { type: 'integer' },
        messagesCreated: { type: 'integer' },
        postsScanned: { type: 'integer' },
        postFailures: {
          items: {
            additionalProperties: false,
            required: ['errorName', 'message', 'postId'],
          },
          type: 'array',
        },
      },
      required: ['conversationsCreated', 'messagesCreated'],
    });
  });
});

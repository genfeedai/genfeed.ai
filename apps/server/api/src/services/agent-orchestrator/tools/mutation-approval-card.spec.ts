import { buildMutationApprovalCard } from '@api/services/agent-orchestrator/tools/mutation-approval-card';
import { describe, expect, it } from 'vitest';

describe('mutation approval summary', () => {
  const context = { organizationId: 'org-1', userId: 'user-1' };
  it.each([2, 64, 0])(
    'uses the trusted selected-model quote of %i credits',
    (credits) => {
      const card = buildMutationApprovalCard(
        'apr-1',
        'generate',
        { type: 'video', estimatedCredits: 999, maximumCredits: 999 },
        context,
        { credits, isAvailable: true, modelKey: 'selected-model' },
      );
      expect(card.data?.estimatedCredits).toBe(credits);
      expect(card.description).toContain(`Estimated cost: ${credits} credits.`);
    },
  );
  it.each([
    undefined,
    { credits: null, isAvailable: false, modelKey: null },
    { credits: 2, isAvailable: true, modelKey: null },
    { credits: Number.NaN, isAvailable: true, modelKey: 'model' },
  ])(
    'does not replace an unavailable generation quote with a floor: %j',
    (quote) => {
      const card = buildMutationApprovalCard(
        'apr-1',
        'generate',
        { type: 'video', estimatedCredits: 64 },
        context,
        quote,
      );
      expect(card.data?.estimatedCredits).toBeUndefined();
      expect(card.description).toContain('quote is unavailable');
      expect(card.description).not.toContain('Estimated cost:');
    },
  );
  it('retains complete consequential nested values while excluding secrets', () => {
    const longCaption = 'Launch caption '.repeat(100);
    const card = buildMutationApprovalCard(
      'apr-1',
      'generate_turbo_content',
      {
        count: 5,
        content: longCaption,
        settings: {
          scheduledAt: '2026-09-07T12:00:00Z',
          recipient: 'person@example.com',
          apiToken: 'secret',
        },
        credentialId: 'private-id',
      },
      context,
    );
    const serialized = JSON.stringify(card.data?.items);
    expect(serialized).toContain(longCaption);
    expect(serialized).toContain('person@example.com');
    expect(serialized).toContain('2026-09-07T12:00:00Z');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('private-id');
    expect(card.ctas?.map((cta) => cta.payload)).toEqual([
      { approvalId: 'apr-1', sourceActionId: 'mutation-approval:apr-1' },
      { approvalId: 'apr-1', sourceActionId: 'mutation-approval:apr-1' },
    ]);
  });
  it('renders empty argument values as readable explicit values', () => {
    const card = buildMutationApprovalCard(
      'apr-1',
      'create_post',
      { content: ' \n\t ', targets: [], settings: {}, option: undefined },
      context,
    );
    expect(card.data?.items).toEqual([
      { label: 'Content', value: 'None' },
      { label: 'Targets', value: 'None' },
      { label: 'Settings', value: 'None' },
      { label: 'Option', value: 'None' },
    ]);
  });

  describe('create_post previews', () => {
    it('hands the card the draft per target and keeps only the remaining details as items', () => {
      const card = buildMutationApprovalCard(
        'apr-1',
        'create_post',
        {
          content: 'Ship it.',
          mediaUrls: ['https://cdn.example.com/a.png'],
          scheduledAt: '2026-10-26T09:00:00Z',
          targets: [
            {
              caption: 'X version',
              credentialId: 'cred-x',
              platform: 'twitter',
            },
            { credentialId: 'cred-li', platform: 'linkedin' },
          ],
        },
        context,
      );

      expect(card.data?.postPreviews).toEqual([
        {
          caption: 'X version',
          credentialId: 'cred-x',
          mediaUrls: ['https://cdn.example.com/a.png'],
          platform: 'twitter',
        },
        {
          caption: 'Ship it.',
          credentialId: 'cred-li',
          mediaUrls: ['https://cdn.example.com/a.png'],
          platform: 'linkedin',
        },
      ]);
      expect(card.data?.items).toEqual([
        { label: 'Scheduled at', value: '2026-10-26T09:00:00Z' },
      ]);
    });

    it('falls back to the platform list and drops duplicates', () => {
      const card = buildMutationApprovalCard(
        'apr-1',
        'create_post',
        { content: 'Hello', platform: 'twitter', platforms: ['twitter', 'x'] },
        context,
      );

      expect(card.data?.postPreviews).toEqual([
        { caption: 'Hello', mediaUrls: [], platform: 'twitter' },
        { caption: 'Hello', mediaUrls: [], platform: 'x' },
      ]);
    });

    it('keeps the generic list when there is nothing to preview', () => {
      const card = buildMutationApprovalCard(
        'apr-1',
        'create_post',
        { contentId: 'content-1', platforms: ['twitter'] },
        context,
      );

      expect(card.data?.postPreviews).toBeUndefined();
      expect(card.data?.items).toEqual([
        { label: 'Content id', value: 'content-1' },
        { label: 'Platforms', value: 'twitter' },
      ]);
    });
  });
});

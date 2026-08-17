import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';
import {
  extractAgentConversationId,
  truncateBreadcrumbLabel,
} from './app-protected-layout.breadcrumb';

const conversationId = testId('conversation');

describe('extractAgentConversationId', () => {
  it('reads brand-scoped agent conversation ids', () => {
    expect(
      extractAgentConversationId(`/default/default/agent/${conversationId}`),
    ).toBe(conversationId);
  });

  it('reads org-scoped agent conversation ids', () => {
    expect(
      extractAgentConversationId(`/default/~/agent/${conversationId}`),
    ).toBe(conversationId);
  });

  it('ignores new / journey / onboarding segments', () => {
    expect(extractAgentConversationId('/default/default/agent/new')).toBeNull();
    expect(
      extractAgentConversationId('/default/default/agent/journey'),
    ).toBeNull();
    expect(
      extractAgentConversationId('/default/default/agent/onboarding'),
    ).toBeNull();
  });
});

describe('truncateBreadcrumbLabel', () => {
  it('keeps short labels intact', () => {
    expect(truncateBreadcrumbLabel('Boxer under armour')).toBe(
      'Boxer under armour',
    );
  });

  it('cuts long labels to 25 characters with an ellipsis', () => {
    expect(
      truncateBreadcrumbLabel(
        'image a image of a boxer with under armour black apparel',
      ),
    ).toBe('image a image of a boxer …');
  });
});

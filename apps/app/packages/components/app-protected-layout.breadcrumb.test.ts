import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';
import {
  extractAgentConversationId,
  extractStoryboardRunId,
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

describe('extractStoryboardRunId', () => {
  it('reads the run id of a storyboard detail route', () => {
    expect(
      extractStoryboardRunId('/default/default/studio/storyboard/run-1'),
    ).toBe('run-1');
  });

  it('ignores the storyboard list and create routes', () => {
    expect(
      extractStoryboardRunId('/default/default/studio/storyboard'),
    ).toBeNull();
    expect(
      extractStoryboardRunId('/default/default/studio/storyboard/new'),
    ).toBeNull();
    expect(extractStoryboardRunId('/default/default/agent/run-1')).toBeNull();
    expect(extractStoryboardRunId(null)).toBeNull();
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

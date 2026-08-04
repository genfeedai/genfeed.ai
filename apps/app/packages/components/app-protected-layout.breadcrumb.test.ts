import { describe, expect, it } from 'vitest';
import {
  extractAgentConversationId,
  truncateBreadcrumbLabel,
} from './app-protected-layout.breadcrumb';

describe('extractAgentConversationId', () => {
  it('reads brand-scoped agent conversation ids', () => {
    expect(
      extractAgentConversationId(
        '/default/default/agent/cmsc9u3e1000035xnv9ftlp40',
      ),
    ).toBe('cmsc9u3e1000035xnv9ftlp40');
  });

  it('reads org-scoped agent conversation ids', () => {
    expect(
      extractAgentConversationId('/default/~/agent/cmsc9u3e1000035xnv9ftlp40'),
    ).toBe('cmsc9u3e1000035xnv9ftlp40');
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

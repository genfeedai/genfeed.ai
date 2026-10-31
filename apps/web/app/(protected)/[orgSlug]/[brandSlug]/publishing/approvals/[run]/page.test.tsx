import { describe, expect, it } from 'vitest';
import PublishingApprovalsRunPage from './page';

describe('PublishingApprovalsRunPage', () => {
  it('renders nothing, the approvals layout renders the queue', () => {
    expect(PublishingApprovalsRunPage()).toBeNull();
  });
});

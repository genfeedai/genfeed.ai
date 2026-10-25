import { describe, expect, it } from 'vitest';
import PublishingApprovalsPage from './page';

describe('PublishingApprovalsPage', () => {
  it('renders nothing, the approvals layout renders the queue', () => {
    expect(PublishingApprovalsPage()).toBeNull();
  });
});

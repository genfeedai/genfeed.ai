import { describe, expect, it } from 'vitest';
import PublishingApprovalsItemPage from './page';

describe('PublishingApprovalsItemPage', () => {
  it('renders nothing, the approvals layout renders the queue', () => {
    expect(PublishingApprovalsItemPage()).toBeNull();
  });
});

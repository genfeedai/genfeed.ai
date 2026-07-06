import { SocialInboxController } from '@api/collections/social-inbox/controllers/social-inbox.controller';

describe('SocialInboxController RBAC', () => {
  it('should require owner, admin, or creator role for syncYoutubeComments', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      SocialInboxController.prototype.syncYoutubeComments,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });

  it('should require owner, admin, or creator role for createDraft', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      SocialInboxController.prototype.createDraft,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });

  it('should require owner or admin role for updateDraft', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      SocialInboxController.prototype.updateDraft,
    );
    expect(metadata).toEqual(['owner', 'admin']);
  });

  it('should require owner or admin role for postReply', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      SocialInboxController.prototype.postReply,
    );
    expect(metadata).toEqual(['owner', 'admin']);
  });

  it('should require owner or admin role for sendDm', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      SocialInboxController.prototype.sendDm,
    );
    expect(metadata).toEqual(['owner', 'admin']);
  });

  it('should require owner or admin role for updateConversation', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      SocialInboxController.prototype.updateConversation,
    );
    expect(metadata).toEqual(['owner', 'admin']);
  });

  it('should not require a role for listConversations, getConversation, or listMessages', () => {
    expect(
      Reflect.getMetadata(
        'roles',
        SocialInboxController.prototype.listConversations,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        'roles',
        SocialInboxController.prototype.getConversation,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        'roles',
        SocialInboxController.prototype.listMessages,
      ),
    ).toBeUndefined();
  });
});

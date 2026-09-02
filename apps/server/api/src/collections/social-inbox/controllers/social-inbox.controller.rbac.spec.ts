import { SocialInboxController } from '@api/collections/social-inbox/controllers/social-inbox.controller';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope } from '@genfeedai/contracts';

describe('SocialInboxController RBAC', () => {
  it('should require owner, admin, or creator role for syncYoutubeComments', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      SocialInboxController.prototype.syncYoutubeComments,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });

  it('should require owner, admin, or creator role for the Instagram sync routes', () => {
    expect(
      Reflect.getMetadata(
        'roles',
        SocialInboxController.prototype.syncInstagramComments,
      ),
    ).toEqual(['owner', 'admin', 'creator']);
    expect(
      Reflect.getMetadata(
        'roles',
        SocialInboxController.prototype.syncInstagramDms,
      ),
    ).toEqual(['owner', 'admin', 'creator']);
  });

  it('should require owner, admin, or creator role for the X and LinkedIn sync routes', () => {
    expect(
      Reflect.getMetadata(
        'roles',
        SocialInboxController.prototype.syncXComments,
      ),
    ).toEqual(['owner', 'admin', 'creator']);
    expect(
      Reflect.getMetadata('roles', SocialInboxController.prototype.syncXDms),
    ).toEqual(['owner', 'admin', 'creator']);
    expect(
      Reflect.getMetadata(
        'roles',
        SocialInboxController.prototype.syncLinkedInComments,
      ),
    ).toEqual(['owner', 'admin', 'creator']);
    expect(
      Reflect.getMetadata(
        'roles',
        SocialInboxController.prototype.syncLinkedInDms,
      ),
    ).toEqual(['owner', 'admin', 'creator']);
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

  it('requires tiered publishing scopes for draft and external-send actions', () => {
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        SocialInboxController.prototype.createDraft,
      ),
    ).toEqual([ApiKeyScope.POSTS_DRAFT, ApiKeyScope.POSTS_CREATE]);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        SocialInboxController.prototype.updateDraft,
      ),
    ).toEqual([ApiKeyScope.POSTS_APPROVE]);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        SocialInboxController.prototype.postReply,
      ),
    ).toEqual([ApiKeyScope.POSTS_PUBLISH]);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        SocialInboxController.prototype.sendDm,
      ),
    ).toEqual([ApiKeyScope.POSTS_PUBLISH]);
  });
});

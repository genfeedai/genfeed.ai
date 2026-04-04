import { describe, expect, it } from 'vitest';
import { ModalEnum } from '../src/modal.enum';

describe('modal.enum', () => {
  describe('ModalEnum', () => {
    it('should have 60 members', () => {
      expect(Object.values(ModalEnum)).toHaveLength(60);
    });

    it('should have correct values', () => {
      expect(ModalEnum.ARTICLE).toBe('modal-article');
      expect(ModalEnum.ARTICLE_GENERATE).toBe('modal-generate-article');
      expect(ModalEnum.AVATAR).toBe('modal-avatar');
      expect(ModalEnum.BLACKLIST).toBe('modal-blacklist');
      expect(ModalEnum.BOT).toBe('modal-bot');
      expect(ModalEnum.BRAND).toBe('modal-brand');
      expect(ModalEnum.BRAND_GENERATE).toBe('modal-brand-generate');
      expect(ModalEnum.BRAND_INSTAGRAM).toBe('modal-brand-instagram');
      expect(ModalEnum.BRAND_LINK).toBe('modal-brand-link');
      expect(ModalEnum.CAMERA).toBe('modal-camera');
      expect(ModalEnum.CAMERA_MOVEMENT).toBe('modal-camera-movement');
      expect(ModalEnum.CAPTION).toBe('modal-caption');
      expect(ModalEnum.CAPTION_DETAIL).toBe('modal-caption-detail');
      expect(ModalEnum.CLIP).toBe('modal-clip');
      expect(ModalEnum.CONFIRM).toBe('modal-confirm');
      expect(ModalEnum.CREDENTIAL).toBe('modal-credential');
      expect(ModalEnum.ERROR_DEBUG).toBe('modal-error-debug');
      expect(ModalEnum.EXPORT).toBe('modal-export');
      expect(ModalEnum.FOLDER).toBe('modal-folder');
      expect(ModalEnum.FONT_FAMILY).toBe('modal-font-family');
      expect(ModalEnum.GALLERY).toBe('modal-gallery');
      expect(ModalEnum.GENERATE_ILLUSTRATION).toBe(
        'modal-generate-illustration',
      );
      expect(ModalEnum.IDEA).toBe('modal-idea');
      expect(ModalEnum.IMAGE_TO_VIDEO).toBe('modal-image-to-video');
      expect(ModalEnum.INGREDIENT).toBe('modal-ingredient');
      expect(ModalEnum.KNOWLEDGE_BASE).toBe('modal-knowledge-base');
      expect(ModalEnum.LENS).toBe('modal-lens');
      expect(ModalEnum.LIGHTING).toBe('modal-lighting');
      expect(ModalEnum.MCP).toBe('modal-mcp');
      expect(ModalEnum.MEMBER).toBe('modal-member');
      expect(ModalEnum.METADATA).toBe('modal-metadata');
      expect(ModalEnum.MODEL).toBe('modal-model');
      expect(ModalEnum.MONITORED_ACCOUNT).toBe('modal-monitored-account');
      expect(ModalEnum.MOOD).toBe('modal-mood');
      expect(ModalEnum.MUSIC).toBe('modal-music');
      expect(ModalEnum.ONBOARDING).toBe('modal-onboarding');
      expect(ModalEnum.POST).toBe('modal-post');
      expect(ModalEnum.POST_BATCH).toBe('modal-post-batch');
      expect(ModalEnum.POST_METADATA).toBe('modal-post-metadata');
      expect(ModalEnum.POST_REMIX).toBe('modal-post-remix');
      expect(ModalEnum.PRESET).toBe('modal-preset');
      expect(ModalEnum.PROMPT).toBe('modal-prompt');
      expect(ModalEnum.REPLY_BOT).toBe('modal-reply-bot');
      expect(ModalEnum.ROLE).toBe('modal-role');
      expect(ModalEnum.SCENE).toBe('modal-scene');
      expect(ModalEnum.SCRIPT).toBe('modal-script');
      expect(ModalEnum.SOUND).toBe('modal-sound');
      expect(ModalEnum.STYLE).toBe('modal-style');
      expect(ModalEnum.SUBSCRIPTION).toBe('modal-subscription');
      expect(ModalEnum.TAG).toBe('modal-tag');
      expect(ModalEnum.TEXT_OVERLAY).toBe('modal-text-overlay');
      expect(ModalEnum.THREAD_CREATE).toBe('modal-thread-create');
      expect(ModalEnum.TRAINING).toBe('modal-training');
      expect(ModalEnum.TRAINING_EDIT).toBe('modal-training-edit');
      expect(ModalEnum.TRAINING_UPLOAD).toBe('modal-training-new');
      expect(ModalEnum.UPLOAD).toBe('modal-upload');
      expect(ModalEnum.UPGRADE_PROMPT).toBe('modal-upgrade-prompt');
      expect(ModalEnum.WATCHLIST).toBe('modal-watchlist');
      expect(ModalEnum.WORKFLOW).toBe('modal-workflow');
      expect(ModalEnum.EDIT_SETTING).toBe('modal-edit-setting');
    });
  });
});

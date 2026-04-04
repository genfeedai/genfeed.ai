import { describe, expect, it } from 'vitest';
import {
  BotCommandType,
  BotInteractionType,
  BotResponseType,
} from '../src/bot-command.enum';

describe('bot-command.enum', () => {
  describe('BotCommandType', () => {
    it('should have 4 members', () => {
      expect(Object.values(BotCommandType)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(BotCommandType.PROMPT_IMAGE).toBe('prompt-image');
      expect(BotCommandType.PROMPT_VIDEO).toBe('prompt-video');
      expect(BotCommandType.SET_BRAND).toBe('set-brand');
      expect(BotCommandType.STATUS).toBe('status');
    });
  });

  describe('BotInteractionType', () => {
    it('should have 5 members', () => {
      expect(
        Object.values(BotInteractionType).filter((v) => typeof v === 'number'),
      ).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(BotInteractionType.PING).toBe(1);
      expect(BotInteractionType.APPLICATION_COMMAND).toBe(2);
      expect(BotInteractionType.MESSAGE_COMPONENT).toBe(3);
      expect(BotInteractionType.APPLICATION_COMMAND_AUTOCOMPLETE).toBe(4);
      expect(BotInteractionType.MODAL_SUBMIT).toBe(5);
    });
  });

  describe('BotResponseType', () => {
    it('should have 7 members', () => {
      expect(
        Object.values(BotResponseType).filter((v) => typeof v === 'number'),
      ).toHaveLength(7);
    });

    it('should have correct values', () => {
      expect(BotResponseType.PONG).toBe(1);
      expect(BotResponseType.CHANNEL_MESSAGE).toBe(4);
      expect(BotResponseType.DEFERRED_CHANNEL_MESSAGE).toBe(5);
      expect(BotResponseType.DEFERRED_UPDATE_MESSAGE).toBe(6);
      expect(BotResponseType.UPDATE_MESSAGE).toBe(7);
      expect(BotResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT).toBe(8);
      expect(BotResponseType.MODAL).toBe(9);
    });
  });
});

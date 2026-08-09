import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { TelegramAPIService } from '@notifications/services/telegram/telegram.api.service';

describe('TelegramAPIService', () => {
  let service: TelegramAPIService;
  let loggerService: LoggerService;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramAPIService,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<TelegramAPIService>(TelegramAPIService);
    loggerService = module.get<LoggerService>(LoggerService);

    loggerService.log('TelegramAPIService initialized');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sanitizeUserInput', () => {
    it('should escape HTML entities', () => {
      const input = '<script>alert("xss")</script>';
      const result = service.sanitizeUserInput(input);

      expect(result).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;',
      );
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });

    it('should handle empty input', () => {
      expect(service.sanitizeUserInput('')).toBe('');
      expect(service.sanitizeUserInput(null)).toBe('');
      expect(service.sanitizeUserInput(undefined)).toBe('');
    });

    it('should escape special characters', () => {
      const input = '& < > " \' /';
      const result = service.sanitizeUserInput(input);

      expect(result).toBe('&amp; &lt; &gt; &quot; &#x27; &#x2F;');
    });

    it('should not modify safe text', () => {
      const input = 'Hello World 123';
      const result = service.sanitizeUserInput(input);

      expect(result).toBe(input);
    });
  });

  describe('bot message helpers', () => {
    const createMockBot = () => ({
      deleteMessage: vi.fn().mockResolvedValue('deleted'),
      editMessageReplyMarkup: vi.fn().mockResolvedValue('edited-markup'),
      editMessageText: vi.fn().mockResolvedValue({ message_id: 'edit-1' }),
      sendDocument: vi.fn().mockResolvedValue('doc-sent'),
      sendMessage: vi.fn().mockResolvedValue({ message_id: 'msg-1' }),
      sendPhoto: vi.fn().mockResolvedValue({ message_id: 'photo-1' }),
      sendVideo: vi.fn().mockResolvedValue('video-sent'),
    });

    describe('sendMessage', () => {
      it('should send a plain message with reply and thread options', async () => {
        const bot = createMockBot();

        const result = await service.sendMessage(
          bot,
          'chat-1',
          'thread-1',
          'msg-0',
          null,
          'Hello',
        );

        expect(bot.sendMessage).toHaveBeenCalledWith('chat-1', 'Hello', {
          message_thread_id: 'thread-1',
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [] },
          reply_to_message_id: 'msg-0',
        });
        expect(result).toEqual({ message_id: 'msg-1' });
      });

      it('should send a photo when photoUrl is provided', async () => {
        const bot = createMockBot();

        const result = await service.sendMessage(
          bot,
          'chat-1',
          null,
          null,
          'https://cdn/img.png',
          'Caption',
        );

        expect(bot.sendPhoto).toHaveBeenCalledWith(
          'chat-1',
          'https://cdn/img.png',
          expect.objectContaining({ caption: 'Caption' }),
        );
        expect(result).toEqual({ message_id: 'photo-1' });
      });

      it('should edit the message when isEdit is true', async () => {
        const bot = createMockBot();

        const result = await service.sendMessage(
          bot,
          'chat-1',
          null,
          'msg-9',
          null,
          'Updated',
          [],
          true,
        );

        expect(bot.editMessageText).toHaveBeenCalledWith(
          'Updated',
          expect.objectContaining({ chat_id: 'chat-1', message_id: 'msg-9' }),
        );
        expect(bot.sendMessage).not.toHaveBeenCalled();
        expect(result).toEqual({ message_id: 'edit-1' });
      });

      it('should log and swallow errors', async () => {
        const bot = createMockBot();
        bot.sendMessage.mockRejectedValue({
          description: 'chat not found',
          error_code: 400,
          message: 'Bad Request',
        });

        const result = await service.sendMessage(
          bot,
          'chat-1',
          null,
          null,
          null,
          'Hello',
        );

        expect(result).toBeUndefined();
        expect(mockLoggerService.error).toHaveBeenCalledWith(
          'sendMessage failed',
          {
            description: 'chat not found',
            message: 'Bad Request',
            status: 400,
          },
          expect.any(Object),
        );
      });
    });

    describe('sendLoading', () => {
      it('should send a loading message and return its id', async () => {
        const bot = createMockBot();

        const result = await service.sendLoading(
          bot,
          'chat-1',
          'thread-1',
          'msg-0',
        );

        expect(bot.sendMessage).toHaveBeenCalledWith(
          'chat-1',
          '... Loading...',
          expect.objectContaining({
            reply_markup: {
              inline_keyboard: [[{ callback_data: 'close', text: 'Close' }]],
            },
          }),
        );
        expect(result).toBe('msg-1');
      });
    });

    describe('editButtons', () => {
      it('should edit message reply markup', async () => {
        const bot = createMockBot();
        const buttons = [[{ callback_data: 'ok', text: 'OK' }]];

        await service.editButtons(bot, 'chat-1', 'msg-1', buttons);

        expect(bot.editMessageReplyMarkup).toHaveBeenCalledWith(
          { inline_keyboard: buttons },
          { chat_id: 'chat-1', message_id: 'msg-1' },
        );
      });
    });

    describe('sendVideo', () => {
      it('should send video with reply id', async () => {
        const bot = createMockBot();

        const result = await service.sendVideo(
          bot,
          'chat-1',
          'https://cdn/vid.mp4',
          'Caption',
          [],
          'msg-0',
        );

        expect(bot.sendVideo).toHaveBeenCalledWith(
          'chat-1',
          'https://cdn/vid.mp4',
          expect.objectContaining({
            caption: 'Caption',
            reply_to_message_id: 'msg-0',
          }),
        );
        expect(result).toBe('video-sent');
      });

      it('should log and swallow send errors', async () => {
        const bot = createMockBot();
        bot.sendVideo.mockRejectedValue(new Error('too large'));

        const result = await service.sendVideo(
          bot,
          'chat-1',
          'https://cdn/vid.mp4',
          'Caption',
        );

        expect(result).toBeUndefined();
        expect(mockLoggerService.error).toHaveBeenCalledWith(
          'sendVideo failed',
          expect.any(Error),
          expect.any(Object),
        );
      });
    });

    describe('sendDocument', () => {
      it('should send a document with caption', async () => {
        const bot = createMockBot();

        const result = await service.sendDocument(
          bot,
          'chat-1',
          { file: 'doc.pdf' },
          'Caption',
        );

        expect(bot.sendDocument).toHaveBeenCalledWith(
          'chat-1',
          { file: 'doc.pdf' },
          expect.objectContaining({ caption: 'Caption' }),
        );
        expect(result).toBe('doc-sent');
      });

      it('should log and swallow send errors', async () => {
        const bot = createMockBot();
        bot.sendDocument.mockRejectedValue(new Error('bad doc'));

        const result = await service.sendDocument(bot, 'chat-1', {}, 'Caption');

        expect(result).toBeUndefined();
        expect(mockLoggerService.error).toHaveBeenCalledWith(
          'sendDocument failed',
          expect.any(Error),
          expect.any(Object),
        );
      });
    });

    describe('deleteMessage', () => {
      it('should delete a message', async () => {
        const bot = createMockBot();

        const result = await service.deleteMessage(bot, 'chat-1', 'msg-1');

        expect(bot.deleteMessage).toHaveBeenCalledWith('chat-1', 'msg-1');
        expect(result).toBe('deleted');
      });

      it('should log and swallow delete errors', async () => {
        const bot = createMockBot();
        bot.deleteMessage.mockRejectedValue(new Error('not found'));

        const result = await service.deleteMessage(bot, 'chat-1', 'msg-1');

        expect(result).toBeUndefined();
        expect(mockLoggerService.error).toHaveBeenCalledWith(
          'deleteMessage failed',
          expect.any(Error),
          expect.any(Object),
        );
      });
    });
  });
});

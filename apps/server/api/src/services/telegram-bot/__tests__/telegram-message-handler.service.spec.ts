import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type {
  ConversationState,
  WorkflowInput,
} from '@api/services/telegram-bot/telegram-bot.types';
import type { TelegramConversationService } from '@api/services/telegram-bot/telegram-conversation.service';
import { TelegramMessageHandlerService } from '@api/services/telegram-bot/telegram-message-handler.service';
import type { TelegramRunCommandsService } from '@api/services/telegram-bot/telegram-run-commands.service';
import { FileInputType } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MessageShape = {
  audio?: { file_id: string; file_name?: string; mime_type?: string };
  document?: { file_id: string; file_name?: string; mime_type?: string };
  video?: { file_id: string; file_name?: string; mime_type?: string };
  voice?: { file_id: string; mime_type?: string };
};

type ContextFixture = {
  ctx: Context;
  getFile: ReturnType<typeof vi.fn>;
  reply: ReturnType<typeof vi.fn>;
};

function createState(input: WorkflowInput): ConversationState {
  return {
    collectedInputs: new Map(),
    currentInputIndex: 0,
    requiredInputs: [input],
    startedAt: Date.now(),
    step: 'collecting_inputs',
  };
}

function createMediaInput(
  inputType: Extract<WorkflowInput['inputType'], 'audio' | 'video'>,
): WorkflowInput {
  return {
    inputType,
    label: inputType === 'audio' ? 'Narration' : 'Reference video',
    nodeId: `${inputType}-node`,
    nodeType: `${inputType}Input`,
    required: true,
  };
}

function createContextFixture(
  message: MessageShape,
  filePath: string,
): ContextFixture {
  const reply = vi.fn();
  const getFile = vi.fn().mockResolvedValue({ file_path: filePath });
  const ctx = {
    api: { getFile },
    chat: { id: 42 },
    message,
    reply,
  } as unknown as Context;

  return { ctx, getFile, reply };
}

function stubFetch(contentType: string | null): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
    headers: { get: vi.fn().mockReturnValue(contentType) },
    ok: true,
    status: 200,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('TelegramMessageHandlerService media inputs', () => {
  let logger: LoggerService;
  let conversation: TelegramConversationService;
  let filesClientService: FilesClientService;
  let promptNextInput: ReturnType<typeof vi.fn>;
  let uploadToS3: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;
    promptNextInput = vi.fn();
    uploadToS3 = vi.fn().mockResolvedValue({
      publicUrl: 'https://cdn.genfeed.ai/telegram-media',
    });
    filesClientService = {
      uploadToS3,
    } as unknown as FilesClientService;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('collects Telegram audio input as a token-free workflow URL', async () => {
    const state = createState(createMediaInput('audio'));
    conversation = {
      getState: vi.fn().mockReturnValue(state),
      promptNextInput,
    } as unknown as TelegramConversationService;
    const service = new TelegramMessageHandlerService(
      logger,
      conversation,
      {} as unknown as TelegramRunCommandsService,
      filesClientService,
    );
    service.setBotToken('bot-token');
    stubFetch('audio/mpeg');
    const { ctx } = createContextFixture(
      {
        audio: {
          file_id: 'audio-file',
          file_name: 'sample.mp3',
          mime_type: 'audio/mpeg',
        },
      },
      'voice/sample.mp3',
    );

    await service.handleAudio(ctx);

    expect(uploadToS3).toHaveBeenCalledWith(
      expect.stringMatching(/^telegram-uploads\/42-audio-node-\d+\.mp3$/),
      'musics',
      expect.objectContaining({
        contentType: 'audio/mpeg',
        data: expect.any(Buffer),
        type: FileInputType.BUFFER,
      }),
    );
    expect(state.collectedInputs.get('audio-node')).toBe(
      'https://cdn.genfeed.ai/telegram-media',
    );
    expect(state.currentInputIndex).toBe(1);
    expect(promptNextInput).toHaveBeenCalledWith(ctx, 42);
  });

  it('collects Telegram video input as a token-free workflow URL', async () => {
    const state = createState(createMediaInput('video'));
    conversation = {
      getState: vi.fn().mockReturnValue(state),
      promptNextInput,
    } as unknown as TelegramConversationService;
    const service = new TelegramMessageHandlerService(
      logger,
      conversation,
      {} as unknown as TelegramRunCommandsService,
      filesClientService,
    );
    service.setBotToken('bot-token');
    stubFetch(null);
    const { ctx } = createContextFixture(
      {
        video: {
          file_id: 'video-file',
          file_name: 'clip.mp4',
          mime_type: 'video/mp4',
        },
      },
      'video/clip.mp4',
    );

    await service.handleVideo(ctx);

    expect(uploadToS3).toHaveBeenCalledWith(
      expect.stringMatching(/^telegram-uploads\/42-video-node-\d+\.mp4$/),
      'videos',
      expect.objectContaining({
        contentType: 'video/mp4',
        data: expect.any(Buffer),
        type: FileInputType.BUFFER,
      }),
    );
    expect(state.collectedInputs.get('video-node')).toBe(
      'https://cdn.genfeed.ai/telegram-media',
    );
    expect(state.currentInputIndex).toBe(1);
    expect(promptNextInput).toHaveBeenCalledWith(ctx, 42);
  });

  it('accepts document uploads for the current audio or video step', async () => {
    const state = createState(createMediaInput('audio'));
    conversation = {
      getState: vi.fn().mockReturnValue(state),
      promptNextInput,
    } as unknown as TelegramConversationService;
    const service = new TelegramMessageHandlerService(
      logger,
      conversation,
      {} as unknown as TelegramRunCommandsService,
      filesClientService,
    );
    service.setBotToken('bot-token');
    stubFetch('audio/wav');
    const { ctx } = createContextFixture(
      {
        document: {
          file_id: 'document-audio',
          file_name: 'source.wav',
          mime_type: 'audio/wav',
        },
      },
      'documents/source.wav',
    );

    await service.handleDocument(ctx);

    expect(uploadToS3).toHaveBeenCalledWith(
      expect.stringMatching(/^telegram-uploads\/42-audio-node-\d+\.wav$/),
      'musics',
      expect.objectContaining({ contentType: 'audio/wav' }),
    );
    expect(state.collectedInputs.get('audio-node')).toBe(
      'https://cdn.genfeed.ai/telegram-media',
    );
  });
});

import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { TELEGRAM_BOT_CONSTANTS } from '@api/services/telegram-bot/telegram-bot.constants';
import type {
  ConversationState,
  WorkflowInput,
  WorkflowJson,
} from '@api/services/telegram-bot/telegram-bot.types';
import { TelegramConversationService } from '@api/services/telegram-bot/telegram-conversation.service';
import { TelegramMessageHandlerService } from '@api/services/telegram-bot/telegram-message-handler.service';
import type { TelegramWorkflowRunnerService } from '@api/services/telegram-bot/telegram-workflow-runner.service';
import { FileInputType } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import type { Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/security/destination-guard', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@libs/security/destination-guard')>();
  return { ...actual, safeFetch: vi.fn() };
});

type TelegramFileFixture = { file_path?: string; file_size?: number };

type MessageShape = {
  photo?: Array<{ file_id: string }>;
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

type CallbackContextFixture = {
  answerCallbackQuery: ReturnType<typeof vi.fn>;
  ctx: Context;
  reply: ReturnType<typeof vi.fn>;
};

function createCallbackContextFixture(data: string): CallbackContextFixture {
  const answerCallbackQuery = vi.fn();
  const reply = vi.fn().mockResolvedValue({ message_id: 99 });
  const ctx = {
    answerCallbackQuery,
    callbackQuery: { data },
    chat: { id: 42 },
    reply,
  } as unknown as Context;

  return { answerCallbackQuery, ctx, reply };
}

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

function createFetchResponse(contentType: string | null) {
  return new Response(new Uint8Array([1, 2, 3]), {
    headers: contentType ? { 'content-type': contentType } : {},
  });
}

function stubFetch(contentType: string | null): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(createFetchResponse(contentType));
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(safeFetch).mockImplementation((...args) => fetchMock(...args));
  return fetchMock;
}

function stubFetchSequence(
  contentTypes: Array<string | null>,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn();
  for (const contentType of contentTypes) {
    fetchMock.mockResolvedValueOnce(createFetchResponse(contentType));
  }
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(safeFetch).mockImplementation((...args) => fetchMock(...args));
  return fetchMock;
}

function lastReplyText(reply: ReturnType<typeof vi.fn>): string {
  const [message] = reply.mock.calls.at(-1) ?? [];
  return typeof message === 'string' ? message : '';
}

function createMediaWorkflow(): WorkflowJson {
  return {
    description: 'Collects audio and video media inputs.',
    edges: [
      {
        id: 'e1',
        source: 'audio-node',
        sourceHandle: 'value',
        target: 'output-node',
        targetHandle: 'audio',
      },
      {
        id: 'e2',
        source: 'video-node',
        sourceHandle: 'value',
        target: 'output-node',
        targetHandle: 'video',
      },
    ],
    inputVariables: [
      {
        key: 'audioUrl',
        label: 'Narration',
        required: true,
        type: 'audio',
      },
      {
        key: 'videoUrl',
        label: 'Reference Video',
        required: true,
        type: 'video',
      },
    ],
    name: 'Media Workflow',
    nodes: [
      {
        data: {
          config: {
            inputName: 'audioUrl',
            inputType: 'audio',
            required: true,
          },
          label: 'Narration',
        },
        id: 'audio-node',
        type: 'workflowInput',
      },
      {
        data: {
          config: {
            inputName: 'videoUrl',
            inputType: 'video',
            required: true,
          },
          label: 'Reference Video',
        },
        id: 'video-node',
        type: 'workflowInput',
      },
      {
        data: { label: 'Final Output' },
        id: 'output-node',
        type: 'output',
      },
    ],
    version: 1,
  };
}

describe('TelegramMessageHandlerService media inputs', () => {
  let logger: LoggerService;
  let conversation: TelegramConversationService;
  let filesClientService: FilesClientService;
  let promptNextInput: ReturnType<typeof vi.fn>;
  let uploadToS3: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.mocked(safeFetch).mockReset();
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
    vi.useRealTimers();
  });

  describe('bounded Telegram source transfers', () => {
    const kinds = ['image', 'audio', 'video'] as const;
    const maxBytes = 20 * 1024 * 1024;

    function prepareTransfer(kind: (typeof kinds)[number]) {
      const input: WorkflowInput =
        kind === 'image'
          ? {
              inputType: 'image',
              label: 'Photo',
              nodeId: 'image-node',
              nodeType: 'imageInput',
              required: true,
            }
          : createMediaInput(kind);
      const state = createState(input);
      conversation = {
        getState: vi.fn().mockReturnValue(state),
        promptNextInput,
        shouldThrottlePhoto: vi.fn().mockReturnValue(false),
      } as unknown as TelegramConversationService;
      const service = new TelegramMessageHandlerService(
        logger,
        conversation,
        filesClientService,
      );
      service.setBotToken('bot-token');
      const fixture = createContextFixture(
        kind === 'image'
          ? { photo: [{ file_id: 'file' }] }
          : kind === 'audio'
            ? { audio: { file_id: 'file' } }
            : { video: { file_id: 'file' } },
        `${kind}/sample.bin`,
      );
      const fetchMock = stubFetch(
        kind === 'image' ? 'image/jpeg' : `${kind}/mpeg`,
      );
      const run = () =>
        kind === 'image'
          ? service.handlePhoto(fixture.ctx)
          : kind === 'audio'
            ? service.handleAudio(fixture.ctx)
            : service.handleVideo(fixture.ctx);
      return { ...fixture, fetchMock, run, state };
    }

    it.each(kinds)(
      'preserves valid %s bytes and state behind the exact public Telegram origin',
      async (kind) => {
        const { run, state } = prepareTransfer(kind);
        await run();
        expect(safeFetch).toHaveBeenCalledWith(
          expect.stringMatching(/^https:\/\/api\.telegram\.org\/file\/bot/),
          { signal: expect.any(AbortSignal) },
          {
            allowedSchemes: ['https:'],
            allowedOrigins: ['https://api.telegram.org'],
          },
        );
        expect(uploadToS3).toHaveBeenCalledWith(
          expect.any(String),
          kind === 'image' ? 'images' : kind === 'audio' ? 'musics' : 'videos',
          expect.objectContaining({ data: Buffer.from([1, 2, 3]) }),
        );
        expect(state.currentInputIndex).toBe(1);
        expect(state.collectedInputs.get(`${kind}-node`)).toBe(
          'https://cdn.genfeed.ai/telegram-media',
        );
        expect(promptNextInput).toHaveBeenCalledTimes(1);
      },
    );

    it.each(kinds)(
      'rejects known oversized %s metadata before fetching, storing, or advancing',
      async (kind) => {
        const { getFile, fetchMock, run, state } = prepareTransfer(kind);
        getFile.mockResolvedValue({
          file_path: `${kind}/large.bin`,
          file_size: maxBytes + 1,
        });
        await run();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(uploadToS3).not.toHaveBeenCalled();
        expect(state.currentInputIndex).toBe(0);
        expect(state.collectedInputs.size).toBe(0);
        expect(promptNextInput).not.toHaveBeenCalled();
      },
    );

    it.each(kinds)(
      'rejects an oversized declared %s response without storage or progression',
      async (kind) => {
        const { fetchMock, run, state } = prepareTransfer(kind);
        fetchMock.mockResolvedValue(
          new Response(new Uint8Array([1]), {
            headers: { 'content-length': String(maxBytes + 1) },
          }),
        );
        await run();
        expect(uploadToS3).not.toHaveBeenCalled();
        expect(state.currentInputIndex).toBe(0);
        expect(promptNextInput).not.toHaveBeenCalled();
      },
    );

    it('rejects missing photo metadata without fetching an undefined path', async () => {
      const { getFile, fetchMock, run, state } = prepareTransfer('image');
      getFile.mockResolvedValue({});
      await run();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(uploadToS3).not.toHaveBeenCalled();
      expect(state.currentInputIndex).toBe(0);
    });

    it('preserves the existing media missing-path message', async () => {
      const { getFile, reply, run, state } = prepareTransfer('audio');
      getFile.mockResolvedValue({});
      await run();
      expect(reply).toHaveBeenCalledWith(
        '❌ This file is too large for the Telegram bot to download (limit: 20 MB). Please compress it or use a smaller file.',
      );
      expect(uploadToS3).not.toHaveBeenCalled();
      expect(state.currentInputIndex).toBe(0);
    });

    it('keeps tokenized source errors out of logs and workflow state', async () => {
      const { fetchMock, run, state } = prepareTransfer('audio');
      const tokenUrl =
        'https://api.telegram.org/file/botbot-token/voice/file.ogg';
      fetchMock.mockRejectedValue(
        new Error(`Source failed at ${tokenUrl}`, { cause: { url: tokenUrl } }),
      );
      await run();
      const logged = JSON.stringify(
        vi.mocked(logger.error).mock.calls,
        (_key, value: unknown) =>
          value instanceof Error
            ? { message: value.message, stack: value.stack, cause: value.cause }
            : value,
      );
      expect(logged).not.toContain('bot-token');
      expect(logged).not.toContain(tokenUrl);
      expect(state.collectedInputs.size).toBe(0);
      expect(uploadToS3).not.toHaveBeenCalled();
    });

    it('bounds stalled getFile metadata within the same transfer deadline', async () => {
      vi.useFakeTimers();
      const { getFile, run, state } = prepareTransfer('audio');
      let resolveFile!: (file: TelegramFileFixture) => void;
      getFile.mockReturnValue(
        new Promise<TelegramFileFixture>((resolve) => {
          resolveFile = resolve;
        }),
      );
      let settled = false;
      const transfer = run().finally(() => {
        settled = true;
      });
      try {
        await vi.advanceTimersByTimeAsync(120_000);
        expect(settled).toBe(true);
        expect(getFile.mock.calls[0]?.[1]?.aborted).toBe(true);
        expect(uploadToS3).not.toHaveBeenCalled();
        expect(state.currentInputIndex).toBe(0);
      } finally {
        resolveFile({ file_path: 'audio/late.ogg' });
        await transfer;
      }
    });

    it('bounds stalled body reads and leaves the input available for retry', async () => {
      vi.useFakeTimers();
      const { fetchMock, run, state } = prepareTransfer('video');
      let streamController!: ReadableStreamDefaultController<Uint8Array>;
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
        },
        cancel() {
          cancelled = true;
        },
      });
      fetchMock.mockResolvedValue(new Response(body));
      let settled = false;
      const transfer = run().finally(() => {
        settled = true;
      });
      try {
        await vi.advanceTimersByTimeAsync(120_000);
        expect(settled).toBe(true);
        expect(cancelled).toBe(true);
        expect(uploadToS3).not.toHaveBeenCalled();
        expect(state.currentInputIndex).toBe(0);
      } finally {
        if (!cancelled) streamController.close();
        await transfer;
      }
    });
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

  it('drives a selected audio/video workflow through collection and run confirmation', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const runner = {
      execute,
    } as unknown as TelegramWorkflowRunnerService;
    conversation = new TelegramConversationService(runner);
    conversation.setWorkflows(
      new Map<string, WorkflowJson>([
        ['media-workflow', createMediaWorkflow()],
      ]),
    );
    uploadToS3
      .mockResolvedValueOnce({
        publicUrl: 'https://cdn.genfeed.ai/audio.mp3',
      })
      .mockResolvedValueOnce({
        publicUrl: 'https://cdn.genfeed.ai/video.mp4',
      });
    const service = new TelegramMessageHandlerService(
      logger,
      conversation,
      filesClientService,
    );
    service.setBotToken('bot-token');
    stubFetchSequence(['audio/mpeg', 'video/mp4']);

    const select = createCallbackContextFixture(
      `${TELEGRAM_BOT_CONSTANTS.CALLBACK_PREFIX.WORKFLOW_SELECT}media-workflow`,
    );
    await conversation.handleCallbackQuery(select.ctx);

    expect(select.answerCallbackQuery).toHaveBeenCalled();
    expect(lastReplyText(select.reply)).toContain('Please send an audio file.');

    const audio = createContextFixture(
      {
        audio: {
          file_id: 'audio-file',
          file_name: 'audio.mp3',
          mime_type: 'audio/mpeg',
        },
      },
      'telegram/audio.mp3',
    );
    await service.handleAudio(audio.ctx);

    expect(lastReplyText(audio.reply)).toContain('Please send a video.');

    const video = createContextFixture(
      {
        video: {
          file_id: 'video-file',
          file_name: 'video.mp4',
          mime_type: 'video/mp4',
        },
      },
      'telegram/video.mp4',
    );
    await service.handleVideo(video.ctx);

    expect(lastReplyText(video.reply)).toContain(
      'Ready to run: Media Workflow',
    );
    expect(lastReplyText(video.reply)).toContain('Audio received');
    expect(lastReplyText(video.reply)).toContain('Video received');

    const confirm = createCallbackContextFixture(
      TELEGRAM_BOT_CONSTANTS.CALLBACK_PREFIX.CONFIRM_RUN,
    );
    await conversation.handleCallbackQuery(confirm.ctx);

    const stateArg = execute.mock.calls[0]?.[2] as
      | ConversationState
      | undefined;
    expect(execute).toHaveBeenCalledOnce();
    expect(stateArg?.collectedInputs.get('audio-node')).toBe(
      'https://cdn.genfeed.ai/audio.mp3',
    );
    expect(stateArg?.collectedInputs.get('audioUrl')).toBe(
      'https://cdn.genfeed.ai/audio.mp3',
    );
    expect(stateArg?.collectedInputs.get('video-node')).toBe(
      'https://cdn.genfeed.ai/video.mp4',
    );
    expect(stateArg?.collectedInputs.get('videoUrl')).toBe(
      'https://cdn.genfeed.ai/video.mp4',
    );
  });
});

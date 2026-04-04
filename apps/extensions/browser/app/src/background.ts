import { authService } from '~services/auth.service';
import { initializeErrorTracking } from '~services/error-tracking.service';
import type { ExtensionMessage } from '~types/extension';
import { logger } from '~utils/logger.util';

// Type for Chrome extension sendResponse callback
type SendResponse = (response?: Record<string, unknown>) => void;

// API base URL
const API_BASE = 'https://api.genfeed.ai';

initializeErrorTracking('background');

// Open side panel on action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => logger.error('Failed to set side panel behavior', err));

// === Context Menu Setup ===

const CONTEXT_MENU_REMIX = 'genfeed-remix';
const CONTEXT_MENU_IDEA = 'genfeed-idea';

chrome.runtime.onInstalled.addListener(() => {
  // Remove stale items before recreating
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      contexts: ['selection', 'page', 'link'],
      id: CONTEXT_MENU_REMIX,
      title: 'Remix with GenFeed',
    });

    chrome.contextMenus.create({
      contexts: ['selection'],
      id: CONTEXT_MENU_IDEA,
      title: 'Save as Idea — GenFeed',
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) {
    return;
  }

  const content = info.selectionText ?? info.linkUrl ?? '';
  const url = info.pageUrl ?? tab.url ?? '';

  let messageType: ExtensionMessage['type'] | null = null;

  if (info.menuItemId === CONTEXT_MENU_REMIX) {
    messageType = 'REMIX';
  } else if (info.menuItemId === CONTEXT_MENU_IDEA) {
    messageType = 'IDEA';
  }

  if (!messageType) {
    return;
  }

  const payload: ExtensionMessage = { content, type: messageType, url };

  // Open side panel then forward the message
  chrome.sidePanel
    .open({ tabId: tab.id })
    .then(() => {
      // Small delay to let the panel boot before receiving the message
      setTimeout(() => {
        chrome.runtime.sendMessage({ payload, type: 'OPEN_MODE' }).catch(() => {
          // Side panel may not be fully ready; retry once
          setTimeout(() => {
            chrome.runtime
              .sendMessage({ payload, type: 'OPEN_MODE' })
              .catch(() => {});
          }, 500);
        });
      }, 300);
    })
    .catch((err) => logger.error('Failed to open side panel', err));
});

// Request types for background handlers
interface ImagePromptRequest {
  prompt?: string;
  referenceImageUrl?: string;
  referenceImage?: string;
}

interface AutoModelRequest {
  content?: string;
}

interface BookmarkData {
  author?: string;
  authorHandle?: string;
  content?: string;
  description?: string;
  intent?: string;
  mediaUrls?: string[];
  platform?: string;
  platformData?: Record<string, unknown>;
  thumbnailUrl?: string;
  title?: string;
  type?: string;
  url?: string;
}

/**
 * Create authenticated headers for API requests
 */
async function getAuthHeaders(): Promise<Headers | null> {
  const token = await authService.getToken();
  if (!token) {
    return null;
  }
  return new Headers({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });
}

/**
 * Send error response with consistent format
 */
function sendError(
  sendResponse: SendResponse,
  message: string,
  error?: unknown,
): void {
  const errorMessage = error instanceof Error ? error.message : message;
  sendResponse({ error: errorMessage, success: false });
}

/**
 * Execute authenticated API request with standard error handling
 */
async function executeAuthenticatedRequest<T>(
  endpoint: string,
  options: RequestInit,
  sendResponse: SendResponse,
  onSuccess: (data: T) => void,
  errorContext: string,
): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    if (!headers) {
      sendResponse({ error: 'Not authenticated', success: false });
      return;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();
    if (response.ok) {
      onSuccess(data);
    } else {
      sendResponse({
        error: data.message || `Failed to ${errorContext}`,
        success: false,
      });
    }
  } catch (error) {
    logger.error(`Error: ${errorContext}`, error);
    sendError(sendResponse, `Failed to ${errorContext}`, error);
  }
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  switch (request.event) {
    case 'checkAuth':
      checkAuthentication(sendResponse);
      return true; // Keep message channel open for async response

    case 'savePost':
      savePostToGenfeed(
        request.postId,
        request.url,
        sendResponse,
        request.platform || 'twitter',
      );
      return true; // Keep message channel open for async response

    case 'saveBookmark':
      saveBookmark(request.data, sendResponse);
      return true; // Keep message channel open for async response

    case 'generateReply':
      generateAIReply(
        {
          platform: request.platform || 'twitter',
          postAuthor: request.postAuthor,
          postContent: request.postContent,
          postId: request.postId,
          url: request.url,
        },
        sendResponse,
      );
      return true; // Keep message channel open for async response

    case 'createVideo':
      createVideoFromPrompt(request.prompt, sendResponse);
      return true; // Keep message channel open for async response

    case 'improvePost':
      improveTweetContent(request.postContent, sendResponse);
      return true; // Keep message channel open for async response

    case 'generatePostImage':
      generateImageFromTweet(request.postContent, sendResponse);
      return true; // Keep message channel open for async response

    case 'getVideos':
      getLatestVideos(sendResponse);
      return true; // Keep message channel open for async response

    case 'generateImage':
      generateImageFromPrompt(request, sendResponse);
      return true; // Keep message channel open for async response

    case 'generateReplyWithMedia':
      generateReplyWithMedia(request, sendResponse);
      return true; // Keep message channel open for async response

    case 'fetchImageAsDataUrl':
      fetchImageAsDataUrl(request.imageUrl, sendResponse);
      return true; // Keep message channel open for async response

    case 'generateReplyWithVideo':
      generateReplyWithVideo(request, sendResponse);
      return true; // Keep message channel open for async response

    case 'autoModel':
      processWithAutoModel(request, sendResponse);
      return true; // Keep message channel open for async response

    case 'PROCESS_YOUTUBE_TRANSCRIPT':
      handleYoutubeTranscript(request.payload, sendResponse);
      return true; // Keep message channel open for async response

    case 'GET_TRANSCRIPT_STATUS':
      getTranscriptStatus(request.payload, sendResponse);
      return true; // Keep message channel open for async response

    case 'logout':
      logout();
      break;

    // === Side Panel Chat Handlers ===

    case 'chatCreateThread':
      handleChatCreateThread(request.payload, sendResponse);
      return true;

    case 'chatSendMessage':
      handleChatSendMessage(request.payload, sendResponse);
      return true;

    case 'chatGetThreads':
      handleChatGetThreads(request.payload, sendResponse);
      return true;

    case 'chatGetMessages':
      handleChatGetMessages(request.payload, sendResponse);
      return true;

    case 'getBrands':
      handleGetBrands(sendResponse);
      return true;

    case 'getBrandVoice':
      handleGetBrandVoice(request.payload, sendResponse);
      return true;

    case 'getCredentials':
      handleGetCredentials(request.payload, sendResponse);
      return true;

    case 'startOAuth':
      handleStartOAuth(request.payload, sendResponse);
      return true;

    case 'RELAY_TO_CONTENT':
      handleRelayToContent(request.payload, sendResponse);
      return true;

    // === Remix / Reply / Idea keyboard shortcut handlers ===

    case 'SHORTCUT_REMIX':
      handleShortcutMode('REMIX', request.payload, sendResponse);
      return true;

    case 'SHORTCUT_REPLY':
      handleShortcutMode('REPLY', request.payload, sendResponse);
      return true;

    case 'SHORTCUT_IDEA':
      handleShortcutMode('IDEA', request.payload, sendResponse);
      return true;
  }
});

// === Shortcut Mode Handler ===

async function handleShortcutMode(
  type: ExtensionMessage['type'],
  payload: { content?: string; url?: string; platform?: string } | undefined,
  sendResponse: SendResponse,
): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      sendResponse({ error: 'No active tab', success: false });
      return;
    }

    const message: ExtensionMessage = {
      content: payload?.content ?? '',
      platform: payload?.platform,
      type,
      url: payload?.url ?? tab.url ?? '',
    };

    await chrome.sidePanel.open({ tabId: tab.id });

    setTimeout(() => {
      chrome.runtime
        .sendMessage({ payload: message, type: 'OPEN_MODE' })
        .catch(() => {});
    }, 300);

    sendResponse({ success: true });
  } catch (err) {
    logger.error('Shortcut mode error', err);
    sendResponse({ error: 'Failed to open mode', success: false });
  }
}

async function checkAuthentication(sendResponse: SendResponse): Promise<void> {
  try {
    const authState = await authService.isAuthenticated();
    sendResponse({
      error: authState.error,
      isAuthenticated: authState.isAuthenticated,
      token: authState.token,
    });
  } catch (error) {
    logger.error('Error checking authentication', error);
    sendResponse({
      error: error instanceof Error ? error.message : 'Unknown error',
      isAuthenticated: false,
      token: null,
    });
  }
}

async function savePostToGenfeed(
  postId: string,
  url: string,
  sendResponse: SendResponse,
  platform: string = 'twitter',
): Promise<void> {
  await executeAuthenticatedRequest(
    '/posts/save',
    {
      body: JSON.stringify({ platform, postId, url }),
      method: 'POST',
    },
    sendResponse,
    (data) => sendResponse({ data, success: true }),
    `save ${platform} post`,
  );
}

interface GenerateReplyParams {
  postId: string;
  url: string;
  postContent: string;
  postAuthor: string;
  platform?: string;
}

async function generateAIReply(
  { url, postContent, postAuthor }: GenerateReplyParams,
  sendResponse: SendResponse,
): Promise<void> {
  const body = JSON.stringify({
    data: {
      attributes: {
        length: 'medium',
        tone: 'friendly',
        tweetAuthor: postAuthor || '',
        tweetContent: postContent || 'No content found',
        tweetUrl: url || '',
      },
      type: 'tweet-reply',
    },
  });

  await executeAuthenticatedRequest<{ reply?: string; message?: string }>(
    '/prompts/tweet',
    { body, method: 'POST' },
    sendResponse,
    (data) => {
      if (data.reply) {
        sendResponse({ reply: data.reply, success: true });
      } else {
        sendResponse({
          error: data.message || 'Failed to generate reply',
          success: false,
        });
      }
    },
    'generate reply',
  );
}

interface ImprovedTweetResponse {
  improvedTweet?: string;
  reply?: string;
  data?: { attributes?: { text?: string } };
  message?: string;
}

async function improveTweetContent(
  tweetContent: string,
  sendResponse: SendResponse,
): Promise<void> {
  await executeAuthenticatedRequest<ImprovedTweetResponse>(
    '/ai/improve-tweet',
    { body: JSON.stringify({ tweetContent }), method: 'POST' },
    sendResponse,
    (data) => {
      const improvedTweet =
        data.improvedTweet || data.reply || data.data?.attributes?.text;

      if (improvedTweet) {
        sendResponse({ improvedTweet, success: true });
      } else {
        sendResponse({
          error: data.message || 'Failed to improve tweet',
          success: false,
        });
      }
    },
    'improve tweet',
  );
}

interface GenerateImageResponse {
  imageUrl?: string;
  url?: string;
  data?: { attributes?: { imageUrl?: string; url?: string } };
  message?: string;
}

async function generateImageFromTweet(
  tweetContent: string,
  sendResponse: SendResponse,
): Promise<void> {
  await executeAuthenticatedRequest<GenerateImageResponse>(
    '/ai/generate-image',
    { body: JSON.stringify({ prompt: tweetContent }), method: 'POST' },
    sendResponse,
    (data) => {
      const imageUrl =
        data.imageUrl ||
        data.url ||
        data.data?.attributes?.imageUrl ||
        data.data?.attributes?.url;

      if (imageUrl) {
        sendResponse({ imageUrl, success: true });
      } else {
        sendResponse({
          error: data.message || 'Failed to generate image',
          success: false,
        });
      }
    },
    'generate image',
  );
}

async function createVideoFromPrompt(
  prompt: string,
  sendResponse: SendResponse,
): Promise<void> {
  await executeAuthenticatedRequest(
    '/videos/create',
    { body: JSON.stringify({ prompt }), method: 'POST' },
    sendResponse,
    (data) => sendResponse({ data, success: true }),
    'create video',
  );
}

async function getLatestVideos(sendResponse: SendResponse): Promise<void> {
  await executeAuthenticatedRequest<{ videos: unknown[] }>(
    '/videos/latest',
    { method: 'GET' },
    sendResponse,
    (data) => sendResponse({ success: true, videos: data.videos }),
    'fetch videos',
  );
}

const MODEL_KEYWORDS: Record<string, string[]> = {
  'google/imagen-4': ['realistic', 'photo', 'portrait'],
  leonardoai: ['art', 'painting', 'style'],
  sdxl: ['logo', 'design'],
};

function selectImageModel(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();

  for (const [model, keywords] of Object.entries(MODEL_KEYWORDS)) {
    if (keywords.some((kw) => lowerPrompt.includes(kw))) {
      return model;
    }
  }

  return 'gpt-image-1'; // Default
}

async function generateImageFromPrompt(
  request: ImagePromptRequest,
  sendResponse: SendResponse,
): Promise<void> {
  const prompt =
    request.prompt || 'Create an image inspired by the provided reference.';
  const selectedModel = selectImageModel(prompt);

  const body = JSON.stringify({
    height: 1024,
    model: selectedModel,
    outputs: 1,
    prompt,
    referenceImage: request.referenceImage,
    width: 1024,
  });

  await executeAuthenticatedRequest<{ id?: string; message?: string }>(
    '/images',
    { body, method: 'POST' },
    sendResponse,
    (data) => {
      if (data.id) {
        sendResponse({
          imageUrl: `https://ingredients.genfeed.ai/images/${data.id}`,
          ingredientId: data.id,
          model: selectedModel,
          success: true,
        });
      } else {
        sendResponse({
          error: data.message || 'Failed to generate image',
          success: false,
        });
      }
    },
    'generate image',
  );
}

type ProcessingType = 'generate' | 'reply' | 'enhance';

function detectProcessingType(content: string): ProcessingType {
  const lowerContent = content.toLowerCase();

  if (['generate', 'create', 'make'].some((kw) => lowerContent.includes(kw))) {
    return 'generate';
  }
  if (['reply', 'respond'].some((kw) => lowerContent.includes(kw))) {
    return 'reply';
  }
  return 'enhance';
}

async function processWithAutoModel(
  request: AutoModelRequest,
  sendResponse: SendResponse,
): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    if (!headers) {
      sendResponse({ error: 'Not authenticated', success: false });
      return;
    }

    const content = request.content || '';
    const processingType = detectProcessingType(content);

    let result = content; // Fallback

    if (processingType === 'reply') {
      const response = await fetch(`${API_BASE}/prompts/tweet`, {
        body: JSON.stringify({
          length: 'medium',
          tone: 'friendly',
          tweetContent: content,
        }),
        headers,
        method: 'POST',
      });
      const data = await response.json();
      if (response.ok && data.reply) {
        result = data.reply;
      }
    } else {
      const category =
        processingType === 'generate' ? 'generate-image' : 'general';
      const response = await fetch(`${API_BASE}/prompts`, {
        body: JSON.stringify({ category, original: content }),
        headers,
        method: 'POST',
      });
      const data = await response.json();
      if (response.ok && data.enhanced) {
        result = data.enhanced;
      }
    }

    sendResponse({ processed: true, result, success: true });
  } catch (error) {
    logger.error('Error processing with auto model', error);
    sendResponse({
      error: 'Failed to process with auto model',
      success: false,
    });
  }
}

async function saveBookmark(
  data: BookmarkData,
  sendResponse: SendResponse,
): Promise<void> {
  const body = JSON.stringify({
    author: data.author,
    authorHandle: data.authorHandle,
    content: data.content || '',
    description: data.description,
    intent: data.intent || 'inspiration',
    mediaUrls: data.mediaUrls || [],
    platform: data.platform || 'twitter',
    platformData: data.platformData || {},
    thumbnailUrl: data.thumbnailUrl,
    title: data.title,
    type: data.type || 'tweet',
    url: data.url,
  });

  await executeAuthenticatedRequest(
    '/bookmarks',
    { body, method: 'POST' },
    sendResponse,
    (result) => sendResponse({ data: result, success: true }),
    'save bookmark',
  );
}

async function handleYoutubeTranscript(
  payload: { youtubeUrl: string },
  sendResponse: SendResponse,
): Promise<void> {
  interface TranscriptResponse {
    data?: { id?: string; status?: string };
    message?: string;
  }

  await executeAuthenticatedRequest<TranscriptResponse>(
    '/transcripts',
    {
      body: JSON.stringify({ youtubeUrl: payload.youtubeUrl }),
      method: 'POST',
    },
    sendResponse,
    (data) => {
      if (data.data) {
        sendResponse({
          status: data.data.status,
          success: true,
          transcriptId: data.data.id,
        });
      } else {
        sendResponse({
          error: data.message || 'Failed to process YouTube video',
          success: false,
        });
      }
    },
    'process YouTube video',
  );
}

interface TranscriptStatusResponse {
  data?: { status?: string };
  message?: string;
}

async function getTranscriptStatus(
  payload: { transcriptId: string },
  sendResponse: SendResponse,
): Promise<void> {
  await executeAuthenticatedRequest<TranscriptStatusResponse>(
    `/transcripts/${payload.transcriptId}`,
    { method: 'GET' },
    sendResponse,
    (data) => {
      if (data.data) {
        sendResponse({
          status: data.data.status,
          success: true,
          transcript: data.data,
        });
      } else {
        sendResponse({
          error: data.message || 'Failed to get transcript status',
          success: false,
        });
      }
    },
    'get transcript status',
  );
}

interface ReplyRequest {
  url: string;
  postContent: string;
  postAuthor: string;
}

interface ReplyResult {
  reply: string;
  headers: Headers;
  token: string;
}

/**
 * Generate reply text - shared by generateReplyWithMedia and generateReplyWithVideo
 */
async function generateReplyText(
  request: ReplyRequest,
): Promise<ReplyResult | { error: string }> {
  const token = await authService.getToken();
  if (!token) {
    return { error: 'Not authenticated' };
  }

  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  const replyBody = JSON.stringify({
    data: {
      attributes: {
        length: 'medium',
        tone: 'friendly',
        tweetAuthor: request.postAuthor || '',
        tweetContent: request.postContent || 'No content found',
        tweetUrl: request.url || '',
      },
      type: 'tweet-reply',
    },
  });

  const response = await fetch(`${API_BASE}/prompts/tweet`, {
    body: replyBody,
    headers,
    method: 'POST',
  });

  const data = await response.json();
  if (!response.ok || !data.reply) {
    return { error: data.message || 'Failed to generate reply' };
  }

  return { headers, reply: data.reply, token };
}

interface MediaReplyRequest {
  postId: string;
  url: string;
  postContent: string;
  postAuthor: string;
  platform: string;
  mediaType: 'image' | 'gif' | 'video';
  imagePrompt?: string;
}

interface MediaReplyResponse {
  success: boolean;
  reply?: string;
  mediaDataUrl?: string;
  mediaType?: string;
  error?: string;
}

async function generateReplyWithMedia(
  request: MediaReplyRequest,
  sendResponse: (response: MediaReplyResponse) => void,
): Promise<void> {
  try {
    const replyResult = await generateReplyText(request);
    if ('error' in replyResult) {
      sendResponse({ error: replyResult.error, success: false });
      return;
    }

    const { headers, reply, token } = replyResult;

    const imagePrompt =
      request.imagePrompt ||
      `Create a visually engaging image that complements this reply: "${reply.substring(0, 200)}"`;

    const imageResponse = await fetch(`${API_BASE}/images`, {
      body: JSON.stringify({
        height: 1024,
        model: 'gpt-image-1',
        outputs: 1,
        prompt: imagePrompt,
        width: 1024,
      }),
      headers,
      method: 'POST',
    });

    const imageData = await imageResponse.json();
    if (!imageResponse.ok || !imageData.id) {
      sendResponse({
        error: 'Image generation failed, reply generated without media',
        reply,
        success: true,
      });
      return;
    }

    const imageUrl = `https://ingredients.genfeed.ai/images/${imageData.id}`;
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const imageDataUrl = await fetchBlobAsDataUrl(imageUrl, token);

    if (!imageDataUrl) {
      sendResponse({
        error: 'Could not fetch image, reply generated without media',
        reply,
        success: true,
      });
      return;
    }

    sendResponse({
      mediaDataUrl: imageDataUrl,
      mediaType: 'image/png',
      reply,
      success: true,
    });
  } catch (error) {
    sendResponse({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to generate reply with media',
      success: false,
    });
  }
}

/**
 * Fetch a URL and convert to data URL (for cross-origin resources)
 * @param maxSizeBytes - Max file size in bytes (default: 50MB for videos)
 */
async function fetchBlobAsDataUrl(
  url: string,
  token?: string,
  maxSizeBytes?: number,
): Promise<string | null> {
  try {
    const headers: HeadersInit = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();

    if (maxSizeBytes && blob.size > maxSizeBytes) {
      logger.warn('File too large for data URL, returning null');
      return null;
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

function fetchVideoBlobAsDataUrl(
  url: string,
  token?: string,
): Promise<string | null> {
  return fetchBlobAsDataUrl(url, token, MAX_VIDEO_SIZE_BYTES);
}

async function fetchImageAsDataUrl(
  imageUrl: string,
  sendResponse: (response: {
    success: boolean;
    dataUrl?: string;
    error?: string;
  }) => void,
): Promise<void> {
  try {
    const token = await authService.getToken();
    const dataUrl = await fetchBlobAsDataUrl(imageUrl, token || undefined);

    if (dataUrl) {
      sendResponse({ dataUrl, success: true });
    } else {
      sendResponse({ error: 'Failed to fetch image', success: false });
    }
  } catch (error) {
    sendResponse({
      error: error instanceof Error ? error.message : 'Failed to fetch image',
      success: false,
    });
  }
}

interface VideoReplyRequest {
  postId: string;
  url: string;
  postContent: string;
  postAuthor: string;
  platform: string;
  videoPrompt?: string;
  duration?: number;
}

interface VideoReplyResponse {
  success: boolean;
  reply?: string;
  mediaDataUrl?: string;
  mediaType?: string;
  videoUrl?: string;
  error?: string;
}

const VIDEO_POLL_INTERVAL_MS = 5000;
const VIDEO_MAX_WAIT_MS = 120000;

async function generateReplyWithVideo(
  request: VideoReplyRequest,
  sendResponse: (response: VideoReplyResponse) => void,
): Promise<void> {
  try {
    const replyResult = await generateReplyText(request);
    if ('error' in replyResult) {
      sendResponse({ error: replyResult.error, success: false });
      return;
    }

    const { headers, reply, token } = replyResult;

    const videoPrompt =
      request.videoPrompt ||
      `Create a short engaging video that complements this reply: "${reply.substring(0, 200)}"`;

    const videoResponse = await fetch(`${API_BASE}/videos/create`, {
      body: JSON.stringify({
        duration: request.duration || 5,
        prompt: videoPrompt,
      }),
      headers,
      method: 'POST',
    });

    const videoData = await videoResponse.json();
    if (!videoResponse.ok || !videoData.id) {
      sendResponse({
        error: 'Video creation failed, reply generated without media',
        reply,
        success: true,
      });
      return;
    }

    // Poll for video completion
    const videoUrl = await pollForVideoCompletion(videoData.id, token);

    if (videoUrl === 'failed') {
      sendResponse({
        error: 'Video generation failed, reply generated without media',
        reply,
        success: true,
      });
      return;
    }

    if (!videoUrl) {
      sendResponse({
        error: 'Video generation timed out, reply generated without media',
        reply,
        success: true,
      });
      return;
    }

    const videoDataUrl = await fetchVideoBlobAsDataUrl(videoUrl, token);

    if (!videoDataUrl) {
      sendResponse({
        error:
          'Could not fetch video data, video URL provided for manual download',
        reply,
        success: true,
        videoUrl,
      });
      return;
    }

    sendResponse({
      mediaDataUrl: videoDataUrl,
      mediaType: 'video/mp4',
      reply,
      success: true,
      videoUrl,
    });
  } catch (error) {
    logger.error('Error generating reply with video', error);
    sendResponse({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to generate reply with video',
      success: false,
    });
  }
}

async function pollForVideoCompletion(
  videoId: string,
  token: string,
): Promise<string | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < VIDEO_MAX_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, VIDEO_POLL_INTERVAL_MS));

    const response = await fetch(`${API_BASE}/videos/${videoId}`, {
      headers: new Headers({ Authorization: `Bearer ${token}` }),
      method: 'GET',
    });

    const data = await response.json();

    if (data.status === 'completed' && data.url) {
      return data.url;
    }
    if (data.status === 'failed') {
      return 'failed';
    }
  }

  return null;
}

async function logout(): Promise<void> {
  await authService.clearToken();
}

// === Side Panel Chat Handler Implementations ===

interface ChatCreatePayload {
  platform?: string;
  brandId?: string;
  title?: string;
}

async function handleChatCreateThread(
  payload: ChatCreatePayload,
  sendResponse: SendResponse,
): Promise<void> {
  await executeAuthenticatedRequest<{ data?: { id?: string } }>(
    '/v1/threads',
    {
      body: JSON.stringify({
        brand: payload.brandId,
        platform: payload.platform,
        title: payload.title,
      }),
      method: 'POST',
    },
    sendResponse,
    (data) => {
      const threadId = data.data?.id;
      if (threadId) {
        sendResponse({ success: true, threadId });
      } else {
        sendResponse({
          error: 'Failed to create thread',
          success: false,
        });
      }
    },
    'create thread',
  );
}

interface ChatSendMessagePayload {
  threadId: string;
  content: string;
  platform?: string;
  brandId?: string;
  pageContext?: { url?: string; postContent?: string; postAuthor?: string };
}

async function handleChatSendMessage(
  payload: ChatSendMessagePayload,
  sendResponse: SendResponse,
): Promise<void> {
  await executeAuthenticatedRequest<{
    data?: {
      id?: string;
      attributes?: {
        content?: string;
        role?: string;
        metadata?: Record<string, unknown>;
        createdAt?: string;
      };
    };
  }>(
    `/v1/threads/${payload.threadId}/messages`,
    {
      body: JSON.stringify({
        brandId: payload.brandId,
        content: payload.content,
        pageContext: payload.pageContext,
        platform: payload.platform,
      }),
      method: 'POST',
    },
    sendResponse,
    (data) => {
      if (data.data) {
        sendResponse({
          message: {
            content: data.data.attributes?.content,
            createdAt: data.data.attributes?.createdAt,
            id: data.data.id,
            metadata: data.data.attributes?.metadata,
          },
          success: true,
        });
      } else {
        sendResponse({ error: 'Failed to send message', success: false });
      }
    },
    'send chat message',
  );
}

interface ChatGetThreadsPayload {
  page?: number;
  limit?: number;
}

async function handleChatGetThreads(
  payload: ChatGetThreadsPayload,
  sendResponse: SendResponse,
): Promise<void> {
  const page = payload.page ?? 1;
  const limit = payload.limit ?? 50;

  await executeAuthenticatedRequest<{
    data?: Array<{ id: string; attributes: Record<string, unknown> }>;
  }>(
    `/v1/threads?page=${page}&limit=${limit}`,
    { method: 'GET' },
    sendResponse,
    (data) => {
      const threads = (data.data ?? []).map((item) => ({
        id: item.id,
        ...item.attributes,
      }));
      sendResponse({ success: true, threads });
    },
    'get threads',
  );
}

interface ChatGetMessagesPayload {
  threadId: string;
  page?: number;
  limit?: number;
}

async function handleChatGetMessages(
  payload: ChatGetMessagesPayload,
  sendResponse: SendResponse,
): Promise<void> {
  const page = payload.page ?? 1;
  const limit = payload.limit ?? 50;

  await executeAuthenticatedRequest<{
    data?: Array<{ id: string; attributes: Record<string, unknown> }>;
  }>(
    `/v1/threads/${payload.threadId}/messages?page=${page}&limit=${limit}`,
    { method: 'GET' },
    sendResponse,
    (data) => {
      const messages = (data.data ?? []).map((item) => ({
        id: item.id,
        ...item.attributes,
      }));
      sendResponse({ messages, success: true });
    },
    'get messages',
  );
}

async function handleGetBrands(sendResponse: SendResponse): Promise<void> {
  await executeAuthenticatedRequest<{
    data?: Array<{ id: string; attributes: Record<string, unknown> }>;
  }>(
    '/v1/brands',
    { method: 'GET' },
    sendResponse,
    (data) => {
      const brands = (data.data ?? []).map((item) => ({
        description: item.attributes.description,
        handle: item.attributes.handle,
        id: item.id,
        isSelected: item.attributes.isSelected,
        label: item.attributes.label,
        logoUrl: item.attributes.logoUrl,
      }));
      sendResponse({ brands, success: true });
    },
    'get brands',
  );
}

interface GetBrandVoicePayload {
  brandId: string;
}

async function handleGetBrandVoice(
  payload: GetBrandVoicePayload,
  sendResponse: SendResponse,
): Promise<void> {
  await executeAuthenticatedRequest<{
    data?: Array<{ attributes: { branding?: Record<string, unknown> } }>;
  }>(
    `/v1/knowledge-bases?brand=${payload.brandId}&limit=1`,
    { method: 'GET' },
    sendResponse,
    (data) => {
      const knowledgeBase = data.data?.[0];
      if (knowledgeBase?.attributes?.branding) {
        sendResponse({
          brandVoice: knowledgeBase.attributes.branding,
          success: true,
        });
      } else {
        sendResponse({ brandVoice: null, success: true });
      }
    },
    'get brand voice',
  );
}

interface GetCredentialsPayload {
  brandId: string;
}

async function handleGetCredentials(
  payload: GetCredentialsPayload,
  sendResponse: SendResponse,
): Promise<void> {
  await executeAuthenticatedRequest<{
    data?: Array<{ id: string; attributes: Record<string, unknown> }>;
  }>(
    `/v1/credentials?brand=${payload.brandId}`,
    { method: 'GET' },
    sendResponse,
    (data) => {
      const credentials = (data.data ?? []).map((item) => ({
        externalHandle: item.attributes.externalHandle,
        id: item.id,
        isConnected: item.attributes.isConnected,
        platform: item.attributes.platform,
      }));
      sendResponse({ credentials, success: true });
    },
    'get credentials',
  );
}

interface OAuthPayload {
  brandId: string;
  platform: string;
  connectEndpoint: string;
}

async function handleStartOAuth(
  payload: OAuthPayload,
  sendResponse: SendResponse,
): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    if (!headers) {
      sendResponse({ error: 'Not authenticated', success: false });
      return;
    }

    const response = await fetch(`${API_BASE}${payload.connectEndpoint}`, {
      body: JSON.stringify({ brandId: payload.brandId }),
      headers,
      method: 'POST',
    });

    const data = await response.json();
    if (!response.ok || !data.url) {
      sendResponse({
        error: data.message || 'Failed to start OAuth',
        success: false,
      });
      return;
    }

    // Open OAuth URL in a new tab
    const tab = await chrome.tabs.create({ url: data.url });

    // Listen for the OAuth callback
    const callbackListener = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      updatedTab: chrome.tabs.Tab,
    ) => {
      if (
        tabId === tab.id &&
        changeInfo.status === 'complete' &&
        updatedTab.url?.includes('oauth/callback')
      ) {
        chrome.tabs.onUpdated.removeListener(callbackListener);

        // Extract tokens from URL
        const url = new URL(updatedTab.url);
        const oauthToken = url.searchParams.get('oauth_token');
        const oauthVerifier = url.searchParams.get('oauth_verifier');
        const code = url.searchParams.get('code');

        // Close the OAuth tab
        chrome.tabs.remove(tabId);

        if (oauthToken && oauthVerifier) {
          // OAuth 1.0 callback (Twitter)
          verifyOAuth(payload, { oauthToken, oauthVerifier }, sendResponse);
        } else if (code) {
          // OAuth 2.0 callback
          verifyOAuth(payload, { code }, sendResponse);
        } else {
          sendResponse({
            error: 'OAuth callback missing tokens',
            success: false,
          });
        }
      }
    };

    chrome.tabs.onUpdated.addListener(callbackListener);

    // Timeout after 5 minutes
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(callbackListener);
    }, 300000);
  } catch (error) {
    logger.error('OAuth error', error);
    sendResponse({
      error: error instanceof Error ? error.message : 'OAuth failed',
      success: false,
    });
  }
}

async function verifyOAuth(
  payload: OAuthPayload,
  tokens: Record<string, string>,
  sendResponse: SendResponse,
): Promise<void> {
  const verifyEndpoint = payload.connectEndpoint.replace('/connect', '/verify');

  await executeAuthenticatedRequest(
    verifyEndpoint,
    {
      body: JSON.stringify({ brandId: payload.brandId, ...tokens }),
      method: 'POST',
    },
    sendResponse,
    () => sendResponse({ success: true }),
    `verify ${payload.platform} OAuth`,
  );
}

interface RelayToContentPayload {
  type: string;
  content?: string;
  platform?: string;
}

async function handleRelayToContent(
  payload: RelayToContentPayload,
  sendResponse: SendResponse,
): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      sendResponse({ error: 'No active tab found', success: false });
      return;
    }

    chrome.tabs.sendMessage(tab.id, payload, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          error: chrome.runtime.lastError.message,
          success: false,
        });
      } else {
        sendResponse(response ?? { success: true });
      }
    });
  } catch (error) {
    logger.error('Relay to content error', error);
    sendResponse({
      error: error instanceof Error ? error.message : 'Relay failed',
      success: false,
    });
  }
}

// Listen for tab updates to sync authentication state
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Check for authentication when user visits genfeed.ai domains
    const isDev =
      process.env.NODE_ENV === 'development' ||
      process.env.PLASMO_PUBLIC_ENV === 'development';
    const devDomain = 'local.genfeed.ai';
    const prodDomain = 'genfeed.ai';
    const targetDomain = isDev ? devDomain : prodDomain;

    if (tab.url.includes(targetDomain)) {
      // Check for authentication when user visits the appropriate genfeed.ai domain
      chrome.runtime.sendMessage({ event: 'checkAuth' });
    }
  }
});

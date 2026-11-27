import { HEYGEN_API_ORIGIN } from '@api/services/integrations/heygen/helpers/heygen-video';

/**
 * HeyGen Video Agent: one prompt in, a finished video out.
 * Endpoints and fields come from HeyGen's public API reference
 * (`POST /v3/video-agents`, `GET /v3/video-agents/{session_id}`,
 * `GET /v3/videos/{video_id}`). The reference does not state the prompt
 * limit, the full status list or the shape of the finished-video response,
 * so this helper sends only `prompt`, treats an unknown status as still
 * running, and reads `video_url` the way the HeyGen Video helper does.
 */
export const HEYGEN_VIDEO_AGENT_PATH = '/v3/video-agents';
export const HEYGEN_VIDEO_AGENT_POLL_INTERVAL_MS = 10_000;
export const HEYGEN_VIDEO_AGENT_POLL_TIMEOUT_MS = 1_200_000;

const VIDEO_AGENT_TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'];

export interface HeyGenVideoAgentBody {
  prompt: string;
}

export interface HeyGenVideoAgentSession {
  sessionId: string;
  videoId?: string;
}

export interface HeyGenVideoAgentStatus {
  failureMessage?: string;
  status: string;
  videoId?: string;
}

function readData(payload: unknown): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const data = (payload as { data?: unknown }).data;
  return data && typeof data === 'object'
    ? (data as Record<string, unknown>)
    : undefined;
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function buildHeyGenVideoAgentBody(
  prompt: string,
): HeyGenVideoAgentBody {
  const text = prompt.trim();
  if (!text) throw new Error('HeyGen Video Agent requires a prompt.');
  return { prompt: text };
}

export function heyGenVideoAgentStatusUrl(sessionId: string): string {
  return `${HEYGEN_API_ORIGIN}${HEYGEN_VIDEO_AGENT_PATH}/${encodeURIComponent(sessionId)}`;
}

export function heyGenVideoAgentVideoUrl(videoId: string): string {
  return `${HEYGEN_API_ORIGIN}/v3/videos/${encodeURIComponent(videoId)}`;
}

export function readHeyGenVideoAgentSession(
  payload: unknown,
): HeyGenVideoAgentSession | undefined {
  const data = readData(payload);
  const sessionId = readText(data?.session_id);
  if (!sessionId) return undefined;
  const videoId = readText(data?.video_id);
  return { sessionId, ...(videoId ? { videoId } : {}) };
}

export function readHeyGenVideoAgentStatus(
  payload: unknown,
): HeyGenVideoAgentStatus {
  const data = readData(payload);
  const failureMessage = readText(data?.failure_message);
  const videoId = readText(data?.video_id);
  return {
    ...(failureMessage ? { failureMessage } : {}),
    status: readText(data?.status) ?? 'pending',
    ...(videoId ? { videoId } : {}),
  };
}

export function isHeyGenVideoAgentTerminal(status: string): boolean {
  return VIDEO_AGENT_TERMINAL_STATUSES.includes(status);
}

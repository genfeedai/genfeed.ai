export interface WorkflowExecutionNodeResultLike {
  output?: unknown;
  status?: string;
}

export interface WorkflowExecutionSnapshot {
  error?: string;
  executionId?: string;
  nodeResults: WorkflowExecutionNodeResultLike[];
  progress?: number;
  status?: string;
}

export interface WorkflowExecutionOutput {
  caption?: string;
  text?: string;
  type: 'audio' | 'image' | 'text' | 'video';
  url?: string;
}

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.mkv'];
const AUDIO_EXTENSIONS = ['.aac', '.m4a', '.mp3', '.ogg', '.wav'];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstString(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === 'string' && value.length > 0);
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function inferMediaTypeFromUrl(url: string): 'audio' | 'image' | 'video' {
  const normalizedUrl = url.toLowerCase();

  if (VIDEO_EXTENSIONS.some((extension) => normalizedUrl.includes(extension))) {
    return 'video';
  }

  if (AUDIO_EXTENSIONS.some((extension) => normalizedUrl.includes(extension))) {
    return 'audio';
  }

  return 'image';
}

function extractOutputFromRecord(
  record: Record<string, unknown>,
): WorkflowExecutionOutput | undefined {
  const caption = firstString(
    readString(record, 'caption'),
    readString(record, 'label'),
    readString(record, 'prompt'),
  );
  const text = firstString(
    readString(record, 'text'),
    readString(record, 'message'),
    readString(record, 'content'),
  );

  const imageUrl = readString(record, 'imageUrl');
  if (imageUrl) {
    return { caption, type: 'image', url: imageUrl };
  }

  const videoUrl = firstString(
    readString(record, 'videoUrl'),
    readString(asRecord(record.video) ?? {}, 'videoUrl'),
  );
  if (videoUrl) {
    return { caption, type: 'video', url: videoUrl };
  }

  const audioUrl = firstString(
    readString(record, 'audioUrl'),
    readString(record, 'musicUrl'),
    readString(asRecord(record.audio) ?? {}, 'audioUrl'),
    readString(asRecord(record.music) ?? {}, 'musicUrl'),
  );
  if (audioUrl) {
    return { caption, type: 'audio', url: audioUrl };
  }

  const mediaUrl = readString(record, 'mediaUrl');
  if (mediaUrl) {
    return {
      caption,
      type: inferMediaTypeFromUrl(mediaUrl),
      url: mediaUrl,
    };
  }

  if (text) {
    return { text, type: 'text' };
  }

  return undefined;
}

export function extractWorkflowExecutionSnapshot(
  payload: unknown,
): WorkflowExecutionSnapshot {
  const document = asRecord(payload);
  const directNodeResults = document?.nodeResults;

  if (Array.isArray(directNodeResults)) {
    return {
      error: typeof document?.error === 'string' ? document.error : undefined,
      executionId:
        typeof document?.executionId === 'string'
          ? document.executionId
          : undefined,
      nodeResults: directNodeResults as WorkflowExecutionNodeResultLike[],
      progress:
        typeof document?.progress === 'number' ? document.progress : undefined,
      status:
        typeof document?.status === 'string' ? document.status : undefined,
    };
  }

  const data = asRecord(document?.data);
  const attributes = asRecord(data?.attributes);
  const nodeResults = Array.isArray(attributes?.nodeResults)
    ? (attributes.nodeResults as WorkflowExecutionNodeResultLike[])
    : [];

  return {
    error: typeof attributes?.error === 'string' ? attributes.error : undefined,
    executionId:
      typeof data?.id === 'string'
        ? data.id
        : typeof attributes?.id === 'string'
          ? attributes.id
          : undefined,
    nodeResults,
    progress:
      typeof attributes?.progress === 'number'
        ? attributes.progress
        : undefined,
    status:
      typeof attributes?.status === 'string' ? attributes.status : undefined,
  };
}

export function extractWorkflowOutputsFromExecution(
  payload: unknown,
): WorkflowExecutionOutput[] {
  const execution = extractWorkflowExecutionSnapshot(payload);
  const outputs: WorkflowExecutionOutput[] = [];
  const seen = new Set<string>();

  for (const nodeResult of execution.nodeResults) {
    const output = extractOutputFromRecord(asRecord(nodeResult.output) ?? {});

    if (!output) {
      continue;
    }

    const dedupeKey = output.url ?? output.text;
    if (dedupeKey && seen.has(dedupeKey)) {
      continue;
    }

    if (dedupeKey) {
      seen.add(dedupeKey);
    }

    outputs.push(output);
  }

  return outputs;
}

export function isWorkflowExecutionTerminalStatus(status?: string): boolean {
  return (
    status === 'cancelled' || status === 'completed' || status === 'failed'
  );
}

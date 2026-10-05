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

function readObjectLikeOrUndefined(
  value: unknown,
): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstString(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === 'string' && value.length > 0);
}

function readStringField(
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
    readStringField(record, 'caption'),
    readStringField(record, 'label'),
    readStringField(record, 'prompt'),
  );
  const text = firstString(
    readStringField(record, 'text'),
    readStringField(record, 'message'),
    readStringField(record, 'content'),
  );

  const imageUrl = readStringField(record, 'imageUrl');
  if (imageUrl) {
    return { caption, type: 'image', url: imageUrl };
  }

  const videoUrl = firstString(
    readStringField(record, 'videoUrl'),
    readStringField(readObjectLikeOrUndefined(record.video) ?? {}, 'videoUrl'),
  );
  if (videoUrl) {
    return { caption, type: 'video', url: videoUrl };
  }

  const audioUrl = firstString(
    readStringField(record, 'audioUrl'),
    readStringField(record, 'musicUrl'),
    readStringField(readObjectLikeOrUndefined(record.audio) ?? {}, 'audioUrl'),
    readStringField(readObjectLikeOrUndefined(record.music) ?? {}, 'musicUrl'),
  );
  if (audioUrl) {
    return { caption, type: 'audio', url: audioUrl };
  }

  const mediaUrl = readStringField(record, 'mediaUrl');
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
  const document = readObjectLikeOrUndefined(payload);
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

  const data = readObjectLikeOrUndefined(document?.data);
  const attributes = readObjectLikeOrUndefined(data?.attributes);
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
    const output = extractOutputFromRecord(
      readObjectLikeOrUndefined(nodeResult.output) ?? {},
    );

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

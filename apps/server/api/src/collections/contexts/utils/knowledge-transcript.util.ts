export interface TranscriptCue {
  endMs: number;
  startMs: number;
  text: string;
}

export interface TranscriptChunk {
  endMs: number;
  startMs: number;
  text: string;
}

const MAX_CHUNK_CHARS = 1200;
const MAX_CHUNK_DURATION_MS = 60_000;
const GAP_BREAK_MS = 2_000;

function parseTimestampToMs(value: string): number {
  const match = value
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?[.,](\d{1,3})$/);
  if (!match) {
    throw new Error('Transcript cue has an invalid timestamp');
  }
  const hasHours = match[3] !== undefined;
  const hours = hasHours ? Number(match[1]) : 0;
  const minutes = hasHours ? Number(match[2]) : Number(match[1]);
  const seconds = hasHours ? Number(match[3]) : Number(match[2]);
  const fraction = match[4] ?? '0';
  const millis = Number(fraction.padEnd(3, '0').slice(0, 3));
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    minutes > 59 ||
    seconds > 59
  ) {
    throw new Error('Transcript cue has an invalid timestamp');
  }
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

function stripCueMarkup(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseWebVtt(source: string): TranscriptCue[] {
  const body = source.replace(/^\uFEFF/, '');
  if (!body.trim().startsWith('WEBVTT')) {
    throw new Error('Transcript is not a valid WebVTT document');
  }
  return parseCues(
    body
      .split(/\r?\n\r?\n/)
      .slice(1)
      .flatMap((block) => parseCueBlock(block, /-->/)),
  );
}

export function parseSrt(source: string): TranscriptCue[] {
  return parseCues(
    source
      .replace(/^\uFEFF/, '')
      .split(/\r?\n\r?\n/)
      .flatMap((block) => parseCueBlock(block, /-->/)),
  );
}

function parseCueBlock(block: string, separator: RegExp): TranscriptCue[] {
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const timing = lines.find((line) => separator.test(line));
  if (!timing) {
    return [];
  }
  const [startRaw, endRaw] = timing.split(separator).map((part) => part.trim());
  if (!startRaw || !endRaw) {
    throw new Error('Transcript cue has an invalid timestamp');
  }
  const startMs = parseTimestampToMs(startRaw.split(' ')[0] ?? '');
  const endMs = parseTimestampToMs(
    (endRaw.split(' ')[0] ?? '').replace(/,.+$/, (match) => match),
  );
  const text = stripCueMarkup(
    lines.filter((line) => line !== timing && !/^\d+$/.test(line)).join(' '),
  );
  if (!text) {
    return [];
  }
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    startMs < 0 ||
    endMs < 0 ||
    endMs < startMs
  ) {
    throw new Error('Transcript cue has an invalid timestamp range');
  }
  return [{ endMs, startMs, text }];
}

function parseCues(cues: TranscriptCue[]): TranscriptCue[] {
  for (let index = 1; index < cues.length; index += 1) {
    const previous = cues[index - 1];
    const current = cues[index];
    if (previous && current && current.startMs < previous.startMs) {
      throw new Error('Transcript cues are out of order');
    }
  }
  return cues;
}

export function chunkTranscriptCues(
  cues: TranscriptCue[],
  splitText: (text: string) => string[] = (text) => [text],
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let buffer: TranscriptCue[] = [];

  const flush = () => {
    if (buffer.length === 0) {
      return;
    }
    const text = buffer
      .map((cue) => cue.text)
      .join(' ')
      .trim();
    const startMs = Math.min(...buffer.map((cue) => cue.startMs));
    const endMs = Math.max(...buffer.map((cue) => cue.endMs));
    chunks.push({ endMs, startMs, text });
    buffer = [];
  };

  for (const cue of cues) {
    if (cue.text.length > MAX_CHUNK_CHARS) {
      flush();
      const fragments = splitText(cue.text);
      for (const fragment of fragments) {
        const trimmed = fragment.trim();
        if (!trimmed) {
          continue;
        }
        chunks.push({
          endMs: cue.endMs,
          startMs: cue.startMs,
          text: trimmed,
        });
      }
      continue;
    }
    const previous = buffer[buffer.length - 1];
    const nextText = [...buffer, cue].map((item) => item.text).join(' ');
    const nextDuration = cue.endMs - (buffer[0]?.startMs ?? cue.startMs);
    if (
      previous &&
      (cue.startMs - previous.endMs > GAP_BREAK_MS ||
        nextText.length > MAX_CHUNK_CHARS ||
        nextDuration > MAX_CHUNK_DURATION_MS)
    ) {
      flush();
    }
    buffer.push(cue);
  }
  flush();
  return chunks;
}

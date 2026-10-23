import type { AgentContentMentionItem } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  filterStudioReferenceLibrary,
  getStudioReferenceKind,
  resolveStudioUploadReferenceRole,
  studioAudioReferenceIds,
} from './studio-reference-selection';

const items: AgentContentMentionItem[] = [
  {
    id: 'image',
    brandId: 'brand',
    contentTitle: 'Still',
    contentType: 'image',
    thumbnailUrl: 'still.png',
  },
  {
    id: 'video',
    brandId: 'brand',
    contentTitle: 'Clip',
    contentType: 'video/mp4',
    thumbnailUrl: 'clip.jpg',
  },
  {
    id: 'audio',
    brandId: 'brand',
    contentTitle: 'Recording',
    contentType: 'audio/wav',
  },
  {
    id: 'voice',
    brandId: 'brand',
    contentTitle: 'ElevenLabs voice',
    contentType: 'VOICE',
  },
  {
    id: 'music',
    brandId: 'brand',
    contentTitle: 'Track',
    contentType: 'music',
    thumbnailUrl: 'track.mp3',
  },
];

describe('Studio reference selection', () => {
  it('offers audio without an image thumbnail and excludes it from visual pickers', () => {
    expect(
      filterStudioReferenceLibrary(items, 'audioReference').map(
        (item) => item.id,
      ),
    ).toEqual(['audio', 'voice', 'music']);
    expect(
      filterStudioReferenceLibrary(items, 'startFrame').map((item) => item.id),
    ).toEqual(['image']);
    expect(
      filterStudioReferenceLibrary(items, 'videoReference').map(
        (item) => item.id,
      ),
    ).toEqual(['video']);
  });
  it.each(['AUDIO', 'voices', 'audio/mpeg', 'MUSIC'])(
    'recognizes %s as audio',
    (value) => expect(getStudioReferenceKind(value)).toBe('audio'),
  );
  it('keeps upload and restored audio out of frame slots while preserving explicit roles', () => {
    expect(resolveStudioUploadReferenceRole('audio', 'video')).toBe(
      'audioReference',
    );
    expect(resolveStudioUploadReferenceRole('audio', 'image')).toBe(
      'audioReference',
    );
    expect(resolveStudioUploadReferenceRole('image', 'video')).toBe(
      'startFrame',
    );
    expect(resolveStudioUploadReferenceRole('video', 'video')).toBe(
      'videoReference',
    );
    expect(resolveStudioUploadReferenceRole('image', 'image-edit')).toBe(
      'editSource',
    );
    expect(resolveStudioUploadReferenceRole('image', 'video', 'endFrame')).toBe(
      'endFrame',
    );
  });
  it('preserves audio input order without mixing image or video IDs', () => {
    expect(
      studioAudioReferenceIds([
        { id: 'voice-b', role: 'audioReference' },
        { id: 'still', role: 'startFrame' },
        { id: 'recording-a', role: 'audioReference' },
        { id: 'clip', role: 'videoReference' },
      ]),
    ).toEqual(['voice-b', 'recording-a']);
  });
});

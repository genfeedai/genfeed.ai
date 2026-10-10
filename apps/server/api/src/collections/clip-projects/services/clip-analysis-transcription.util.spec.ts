import { readSavedClipTranscription } from './clip-analysis-transcription.util';

describe('saved clip transcription recovery', () => {
  const transcription = {
    duration: 25,
    language: 'en',
    segments: [{ start: 0, end: 25, text: 'A real transcript.' }],
    srt: '1\n00:00:00,000 --> 00:00:25,000\nA real transcript.',
    text: 'A real transcript.',
  };
  const checkpoint = {
    requestedLanguage: 'en',
    sourceFingerprint: 'sha256:source',
    transcription,
  };

  it('reuses only the exact source and requested language', () => {
    expect(
      readSavedClipTranscription(checkpoint, 'sha256:source', 'en'),
    ).toEqual(transcription);
    expect(
      readSavedClipTranscription(checkpoint, 'sha256:other', 'en'),
    ).toBeUndefined();
    expect(
      readSavedClipTranscription(checkpoint, 'sha256:source', 'fr'),
    ).toBeUndefined();
  });

  it.each([
    { duration: Number.NaN },
    { text: undefined },
    { srt: undefined },
    { segments: [{ start: 5, end: 2, text: 'Invalid time.' }] },
    {
      segments: [
        {
          start: 0,
          end: 2,
          text: 'Invalid words.',
          words: [{ start: 2, end: 1, word: 'Invalid' }],
        },
      ],
    },
  ])('refuses malformed durable transcription %j', (invalid) => {
    expect(
      readSavedClipTranscription(
        { ...checkpoint, transcription: { ...transcription, ...invalid } },
        'sha256:source',
        'en',
      ),
    ).toBeUndefined();
  });
});

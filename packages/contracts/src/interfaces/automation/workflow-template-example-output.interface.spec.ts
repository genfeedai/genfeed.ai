import { describe, expect, it } from 'vitest';
import { MediaType } from '../../enums/media-type.enum';
import {
  isWorkflowTemplateExampleOutputUrl,
  parseWorkflowTemplateExampleOutput,
} from './workflow-template-example-output.interface';

describe('parseWorkflowTemplateExampleOutput', () => {
  it('reads an image example output', () => {
    expect(
      parseWorkflowTemplateExampleOutput({
        mediaType: 'image',
        url: 'https://cdn.example.com/examples/thread.png',
      }),
    ).toEqual({
      mediaType: MediaType.IMAGE,
      url: 'https://cdn.example.com/examples/thread.png',
    });
  });

  it('reads a video example output with its poster', () => {
    expect(
      parseWorkflowTemplateExampleOutput({
        mediaType: 'video',
        posterUrl: 'https://cdn.example.com/examples/ugc.jpg',
        url: 'https://cdn.example.com/examples/ugc.mp4',
      }),
    ).toEqual({
      mediaType: MediaType.VIDEO,
      posterUrl: 'https://cdn.example.com/examples/ugc.jpg',
      url: 'https://cdn.example.com/examples/ugc.mp4',
    });
  });

  it('drops a malformed poster but keeps the video', () => {
    expect(
      parseWorkflowTemplateExampleOutput({
        mediaType: 'video',
        posterUrl: 'javascript:alert(1)',
        url: 'https://cdn.example.com/examples/ugc.mp4',
      }),
    ).toEqual({
      mediaType: MediaType.VIDEO,
      url: 'https://cdn.example.com/examples/ugc.mp4',
    });
  });

  it.each([
    undefined,
    null,
    'https://cdn.example.com/examples/thread.png',
    [],
    { url: 'https://cdn.example.com/examples/thread.png' },
    { mediaType: 'audio', url: 'https://cdn.example.com/examples/a.mp3' },
    { mediaType: 'image' },
    { mediaType: 'image', url: '' },
    { mediaType: 'image', url: '/examples/thread.png' },
    { mediaType: 'image', url: 'javascript:alert(1)' },
    { mediaType: 'image', url: 'data:image/png;base64,AAAA' },
  ])('reads %j as no example output', (value) => {
    expect(parseWorkflowTemplateExampleOutput(value)).toBeUndefined();
  });
});

describe('isWorkflowTemplateExampleOutputUrl', () => {
  it('accepts absolute http(s) URLs only', () => {
    expect(
      isWorkflowTemplateExampleOutputUrl('https://cdn.example.com/a'),
    ).toBe(true);
    expect(isWorkflowTemplateExampleOutputUrl('http://localhost:3012/a')).toBe(
      true,
    );
    expect(isWorkflowTemplateExampleOutputUrl('ftp://cdn.example.com/a')).toBe(
      false,
    );
    expect(isWorkflowTemplateExampleOutputUrl(42)).toBe(false);
  });
});

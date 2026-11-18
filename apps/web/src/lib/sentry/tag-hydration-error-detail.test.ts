import { describe, expect, it } from 'vitest';
import { tagHydrationErrorDetail } from './tag-hydration-error-detail';

describe('tagHydrationErrorDetail', () => {
  it('tags the first line and the diff element names of a hydration error', () => {
    const event = tagHydrationErrorDetail({
      exception: {
        values: [
          {
            value:
              'Hydration failed because the server rendered HTML didn\'t match the client. See https://react.dev/link/hydration-mismatch\n\n  <html>\n    <body>\n+     <h1 className="secret">Jane Doe</h1>\n-     <p>',
          },
        ],
      },
      tags: { existing: 'kept' },
    });

    expect(event.tags).toEqual({
      existing: 'kept',
      hydration_diff_elements: 'html,body,h1,p',
      hydration_message:
        "Hydration failed because the server rendered HTML didn't match the client. See <url>",
    });
  });

  it('reads a hydration message captured as a plain message', () => {
    const event = tagHydrationErrorDetail({
      message: 'Text content does not match server-rendered HTML.\n<div>',
    });

    expect(event.tags).toEqual({
      hydration_diff_elements: 'div',
      hydration_message: 'Text content does not match server-rendered HTML.',
    });
  });

  it.each([418, 419, 422, 423, 425])(
    'recognizes both production decoder URLs for hydration error %s',
    (code) => {
      for (const url of [
        `https://react.dev/errors/${code}?args[]=fixture`,
        `https://reactjs.org/docs/error-decoder.html?invariant=${code}&args[]=fixture`,
      ]) {
        expect(tagHydrationErrorDetail({ message: url }).tags).toEqual({
          hydration_message: `Minified React error #${code}`,
        });
      }
    },
  );

  it.each([4190, 420])(
    'leaves a different minified error %s untouched',
    (code) => {
      const message = `Minified React error #${code}; visit https://react.dev/errors/${code}`;
      expect(tagHydrationErrorDetail({ message }).tags).toBeUndefined();
    },
  );

  it('leaves other errors untouched', () => {
    const event = tagHydrationErrorDetail({
      exception: { values: [{ value: 'Network request failed' }] },
    });

    expect(event.tags).toBeUndefined();
  });
});

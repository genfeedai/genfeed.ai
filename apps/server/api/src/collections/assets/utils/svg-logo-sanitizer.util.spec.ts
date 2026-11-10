import {
  SVG_LOGO_MAX_BYTES,
  SvgLogoRejectedError,
  sanitizeSvgLogo,
} from '@api/collections/assets/utils/svg-logo-sanitizer.util';
import sharp from 'sharp';

const OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';

function clean(markup: string): string {
  return sanitizeSvgLogo(Buffer.from(markup)).toString('utf8');
}

function rejection(markup: string | Buffer): string | undefined {
  try {
    sanitizeSvgLogo(Buffer.isBuffer(markup) ? markup : Buffer.from(markup));
    return undefined;
  } catch (error: unknown) {
    return error instanceof SvgLogoRejectedError ? error.reason : 'other';
  }
}

describe('sanitizeSvgLogo', () => {
  it.each([
    [
      'a script element',
      '<svg width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>',
      `${OPEN} width="10" height="10"><rect width="10" height="10"></rect></svg>`,
    ],
    [
      'event handler attributes',
      '<svg width="10" height="10" onload="alert(1)"><rect onclick="alert(1)" width="1" height="1"/></svg>',
      `${OPEN} width="10" height="10"><rect width="1" height="1"></rect></svg>`,
    ],
    [
      'foreignObject with HTML inside',
      '<svg width="10" height="10"><foreignObject><iframe src="https://x.test"/></foreignObject></svg>',
      `${OPEN} width="10" height="10"></svg>`,
    ],
    [
      'links, images and animations',
      '<svg width="10" height="10"><a href="https://x.test"><text>hi</text></a><image href="https://x.test/a.png"/><set attributeName="href" to="javascript:alert(1)"/></svg>',
      `${OPEN} width="10" height="10"></svg>`,
    ],
    [
      'a reference that leaves the document',
      '<svg width="10" height="10"><use href="javascript:alert(1)"/><use xlink:href="https://x.test/s.svg#a"/><use href="#mark"/></svg>',
      `${OPEN} width="10" height="10"><use></use><use></use><use href="#mark"></use></svg>`,
    ],
    [
      'a paint server outside the document',
      '<svg width="10" height="10"><rect fill="url(https://x.test/a)" stroke="url(#edge)" width="1" height="1"/></svg>',
      `${OPEN} width="10" height="10"><rect stroke="url(#edge)" width="1" height="1"></rect></svg>`,
    ],
    [
      'an inline style that loads a file',
      '<svg width="10" height="10"><rect style="fill:url(https://x.test/a)" width="1" height="1"/><circle style="fill:red" r="1"/></svg>',
      `${OPEN} width="10" height="10"><rect width="1" height="1"></rect><circle style="fill:red" r="1"></circle></svg>`,
    ],
    [
      'a stylesheet that imports another',
      '<svg width="10" height="10"><style>@import url(https://x.test/a.css);</style></svg>',
      `${OPEN} width="10" height="10"></svg>`,
    ],
    [
      'comments, DOCTYPE, entities and processing instructions',
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY boom "x">]><!-- note --><svg width="10" height="10"><text>&boom; a &amp; b</text></svg>',
      `${OPEN} width="10" height="10"><text>&amp;boom; a &amp; b</text></svg>`,
    ],
    [
      'editor metadata and namespaced attributes',
      '<svg xmlns:sodipodi="http://x" width="10" height="10" sodipodi:docname="a"><metadata><rdf:RDF/></metadata><g data-name="Layer 1"/></svg>',
      `${OPEN} width="10" height="10"><g></g></svg>`,
    ],
    [
      'a second root after the logo',
      '<svg width="10" height="10"></svg><svg onload="alert(1)"></svg>',
      `${OPEN} width="10" height="10"></svg>`,
    ],
  ])('removes %s', (_case, input, expected) => {
    expect(clean(input)).toBe(expected);
  });

  it('keeps a design-tool export: classes, a stylesheet and gradients', () => {
    expect(
      clean(
        '<svg viewBox="0 0 24 24"><defs><style><![CDATA[.cls-1{fill:#0a84ff}]]></style><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path class="cls-1" fill="url(#g)" d="M0 0h24v24H0z"/></svg>',
      ),
    ).toBe(
      `${OPEN} viewBox="0 0 24 24"><defs><style>.cls-1{fill:#0a84ff}</style><linearGradient id="g"><stop offset="0" stop-color="#fff"></stop></linearGradient></defs><path class="cls-1" fill="url(#g)" d="M0 0h24v24H0z"></path></svg>`,
    );
  });

  it('escapes text and attribute values in the output', () => {
    expect(
      clean('<svg width="10" height="10"><title>a &lt;b&gt; "c"</title></svg>'),
    ).toBe(
      `${OPEN} width="10" height="10"><title>a &lt;b&gt; &quot;c&quot;</title></svg>`,
    );
  });

  it('writes markup the renderer reads at its declared size', async () => {
    const output = sanitizeSvgLogo(
      Buffer.from(
        '<svg width="64" height="32"><rect width="64" height="32" fill="#000"/></svg>',
      ),
    );
    await expect(sharp(output).metadata()).resolves.toMatchObject({
      format: 'svg',
      height: 32,
      width: 64,
    });
  });

  it.each([
    ['an HTML page', '<html><body><svg/></body></html>', 'svg_logo_not_svg'],
    ['plain text', 'not an image', 'svg_logo_not_svg'],
    [
      'more nested elements than a logo needs',
      `<svg>${'<g>'.repeat(80)}</svg>`,
      'svg_logo_too_complex',
    ],
    [
      'more element references than a logo needs',
      `<svg>${'<use href="#a"/>'.repeat(201)}</svg>`,
      'svg_logo_too_complex',
    ],
  ])('refuses %s', (_case, input, reason) => {
    expect(rejection(input)).toBe(reason);
  });

  it('refuses a file over the size limit', () => {
    expect(rejection(Buffer.alloc(SVG_LOGO_MAX_BYTES + 1, 0x20))).toBe(
      'svg_logo_too_large',
    );
  });
});

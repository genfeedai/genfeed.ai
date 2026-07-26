import sanitize from 'sanitize-html';

/**
 * Elements that survive sanitization.
 *
 * This is an allowlist by design. The previous implementation denied a fixed
 * list of twelve elements with regular expressions, which meant every element
 * nobody had thought of — `<form>`, `<input>`, `<button>`, `<marquee>` — was
 * permitted by default, and any markup the regexes tokenized differently from
 * a browser (`<scr<script>ipt>`, a `>` inside a quoted attribute value, an
 * unterminated tag) escaped the filter entirely.
 */
const ALLOWED_TAGS = [
  'a',
  'abbr',
  'address',
  'article',
  'aside',
  'audio',
  'b',
  'blockquote',
  'br',
  'caption',
  'code',
  'col',
  'colgroup',
  'data',
  'dd',
  'del',
  'details',
  'dfn',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'i',
  'img',
  'ins',
  'kbd',
  'li',
  'main',
  'mark',
  'nav',
  'ol',
  'p',
  'picture',
  'pre',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'section',
  'small',
  'source',
  'span',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'time',
  'tr',
  'track',
  'u',
  'ul',
  'var',
  'video',
  'wbr',
];

/**
 * Attributes that survive sanitization, per element.
 *
 * Anything absent is dropped, so `on*` handlers, `style`, `srcdoc`,
 * `formaction` and every future attribute are removed without needing to be
 * enumerated. `id` is retained because article content relies on it for
 * in-page heading anchors.
 */
const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  '*': ['class', 'dir', 'id', 'lang', 'title'],
  a: ['href', 'rel', 'target'],
  audio: ['controls', 'loop', 'muted', 'preload', 'src'],
  blockquote: ['cite'],
  col: ['span'],
  colgroup: ['span'],
  del: ['cite', 'datetime'],
  img: ['alt', 'height', 'loading', 'sizes', 'src', 'srcset', 'width'],
  ins: ['cite', 'datetime'],
  li: ['value'],
  ol: ['reversed', 'start', 'type'],
  q: ['cite'],
  source: ['media', 'sizes', 'src', 'srcset', 'type'],
  td: ['colspan', 'headers', 'rowspan'],
  th: ['abbr', 'colspan', 'headers', 'rowspan', 'scope'],
  time: ['datetime'],
  track: ['default', 'kind', 'label', 'src', 'srclang'],
  video: [
    'controls',
    'height',
    'loop',
    'muted',
    'playsinline',
    'poster',
    'preload',
    'src',
    'width',
  ],
};

/**
 * URL schemes permitted in navigational and resource attributes. `javascript:`,
 * `vbscript:` and `data:` are excluded, and the check runs after the parser has
 * decoded entities, so `jav&#x09;ascript:` and `&#106;avascript:` are rejected
 * too.
 */
const ALLOWED_SCHEMES = ['http', 'https', 'mailto', 'tel'];

/**
 * Attributes the scheme allowlist is enforced on. `srcset` is deliberately
 * absent: the sanitizer parses it and checks each candidate URL individually,
 * so listing it here would run the check against the whole comma-separated
 * string and reject valid values.
 */
const SCHEME_ATTRIBUTES = ['cite', 'href', 'poster', 'src'];

/**
 * Elements whose text content is discarded along with the element, rather than
 * being unwrapped into the output. Unwrapping `<script>alert(1)</script>` is
 * safe but leaves `alert(1)` as visible prose; for these elements the content
 * is never meant to be read as text.
 */
const NON_TEXT_TAGS = [
  'embed',
  'iframe',
  'math',
  'noscript',
  'object',
  'option',
  'script',
  'style',
  'svg',
  'template',
  'textarea',
  'title',
];

const SANITIZE_OPTIONS: sanitize.IOptions = {
  allowedAttributes: ALLOWED_ATTRIBUTES,
  allowedSchemes: ALLOWED_SCHEMES,
  allowedSchemesAppliedToAttributes: SCHEME_ATTRIBUTES,
  allowedTags: ALLOWED_TAGS,
  disallowedTagsMode: 'discard',
  nonTextTags: NON_TEXT_TAGS,
  transformTags: {
    // A link that opens a new browsing context hands the opener a `window`
    // reference back to the destination unless it is severed explicitly.
    a: (tagName, attribs) => {
      if (!attribs.target) {
        return { attribs, tagName };
      }
      return { attribs: { ...attribs, rel: 'noopener noreferrer' }, tagName };
    },
  },
};

/**
 * Sanitize HTML without loading browser emulation in server-rendered routes.
 *
 * Backed by a real HTML tokenizer (`htmlparser2`), so the input is parsed the
 * way a browser parses it and then re-serialized from the resulting tree.
 * Malformed, nested or entity-obfuscated markup cannot slip past by being
 * shaped differently from what a pattern expected.
 */
export function sanitizeHtml(html: string): string {
  if (!html) {
    return '';
  }
  return sanitize(html, SANITIZE_OPTIONS);
}

/**
 * Safe wrapper for dangerouslySetInnerHTML.
 */
export function createMarkup(html: string): { __html: string } {
  return { __html: sanitizeHtml(html) };
}

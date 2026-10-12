import { FONT_MIME_TYPES } from './protocol.mjs';

// Brand font files staged by the API arrive as assets with the faces to declare.
// The renderer declares them itself, so a composition uses the family by name and
// never has to know an asset id. The declaration points at the staged file served
// from the page's own origin, which is what lets the render evidence attribute
// the font to the asset (id and hash) rather than to a URL the composition wrote.
const CSS_FORMATS = {
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'truetype',
  'font/otf': 'opentype',
};

/** Every face the staged font assets ask the renderer to declare. */
export function collectBrandFontFaces(assets) {
  return assets
    .filter((asset) => FONT_MIME_TYPES.includes(asset.mime))
    .flatMap((asset) =>
      (asset.faces ?? []).map((face) => ({
        id: asset.id,
        format: CSS_FORMATS[asset.mime],
        family: face.family,
        weight: face.weight,
        style: face.style,
      })),
    );
}

/**
 * The module that registers the composition. Without faces it is the plain
 * registration; with faces the composition is wrapped so the `@font-face` rules
 * are in the page and the frame waits until Chromium has loaded every face. A
 * face that fails to load is not an error here: the font engine then reports the
 * fallback it really used.
 */
export function rootSource({ settings, props, faces }) {
  const composition = `<Composition id="VisualComposition" component={${
    faces.length > 0 ? 'WithBrandFonts' : 'VisualComposition'
  }} width={${settings.width}} height={${settings.height}} fps={${settings.fps}} durationInFrames={${settings.durationFrames}} defaultProps={${JSON.stringify(props)}}/>`;
  if (faces.length === 0)
    return `import React from 'react';\nimport {Composition,registerRoot} from 'remotion';\nimport {VisualComposition} from './VisualComposition';\nregisterRoot(() => ${composition});`;
  return `import React from 'react';
import {Composition,registerRoot,staticFile,delayRender,continueRender} from 'remotion';
import {VisualComposition} from './VisualComposition';
const brandFontFaces = ${JSON.stringify(faces)};
const brandFontCss = brandFontFaces.map((face) => '@font-face{font-family:' + JSON.stringify(face.family) + ';src:url(' + JSON.stringify(staticFile('assets/' + face.id)) + ') format(' + JSON.stringify(face.format) + ');font-weight:' + face.weight + ';font-style:' + face.style + ';font-display:block}').join('\\n');
function WithBrandFonts(props) {
  const [handle] = React.useState(() => delayRender('brand-fonts'));
  React.useEffect(() => {
    let isDone = false;
    const finish = () => {
      if (isDone) return;
      isDone = true;
      continueRender(handle);
    };
    Promise.all(brandFontFaces.map((face) => document.fonts.load(face.style + ' ' + face.weight + ' 16px ' + JSON.stringify(face.family)))).then(finish, finish);
  }, [handle]);
  return <><style>{brandFontCss}</style><VisualComposition {...props}/></>;
}
registerRoot(() => ${composition});`;
}

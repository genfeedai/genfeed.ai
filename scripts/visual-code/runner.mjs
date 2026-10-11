import {
  DEADLINE_MS,
  encodeFrame,
  MAX_DIAGNOSTICS,
  RENDERER_VERSION,
  readFrame,
  validateInput,
} from './protocol.mjs';
import { renderVisualComposition } from './render.mjs';

// This entrypoint runs exclusively inside the credential-free runsc container.
const output = process.stdout.write.bind(process.stdout);
process.stdout.write = (...args) => process.stderr.write(...args);
const timeout = setTimeout(() => process.exit(124), DEADLINE_MS);
try {
  const input = validateInput(await readFrame(process.stdin));
  const media = await renderVisualComposition(input);
  output(
    encodeFrame({ rendererVersion: RENDERER_VERSION, media, diagnostics: [] }),
  );
} catch (error) {
  const diagnostic = error instanceof Error ? error.message : 'Render failed';
  const bounded = Buffer.from(diagnostic)
    .subarray(0, MAX_DIAGNOSTICS / 2)
    .toString('utf8');
  output(
    encodeFrame({
      rendererVersion: RENDERER_VERSION,
      media: [],
      diagnostics: [bounded],
    }),
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}

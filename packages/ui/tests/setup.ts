import '../src/components/tests/setup';
import { beforeAll } from 'vitest';
import { preloadButtonTooltip } from '../src/primitives/button-tooltip';

// The preload is a cold dynamic import of Radix Tooltip through Vite's
// transform pipeline, once per test file in a fresh module graph. On a loaded CI
// runner (hundreds of jsdom files contending for one Vite server) a single
// import has taken longer than Vitest's 10s default hook timeout and failed the
// whole file (#5571), so give this hook a budget that matches its cost.
const TOOLTIP_PRELOAD_TIMEOUT_MS = 60_000;

// Tests mount components without the app's root `TooltipProvider`, so a
// tooltip `Button` would defer its hint and remount its DOM node when the hint
// loads, mid-test. Loading it first gives the app's single render; as a hook
// rather than an import, a test's own `vi.mock` of the tooltip still applies.
beforeAll(async () => {
  await preloadButtonTooltip();
}, TOOLTIP_PRELOAD_TIMEOUT_MS);

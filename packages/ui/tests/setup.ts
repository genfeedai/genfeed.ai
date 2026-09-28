import '../src/components/tests/setup';
import { beforeAll } from 'vitest';
import { preloadButtonTooltip } from '../src/primitives/button-tooltip';

// Tests mount components without the app's root `TooltipProvider`, so a
// tooltip `Button` would defer its hint and remount its DOM node when the hint
// loads, mid-test. Loading it first gives the app's single render; as a hook
// rather than an import, a test's own `vi.mock` of the tooltip still applies.
beforeAll(async () => {
  await preloadButtonTooltip();
});

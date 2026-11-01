import type { HandBuiltArea } from '../core';
import { classUtilities, finding, SHARED_PACKAGE, walkJsx } from '../jsx';

/**
 * Loading and live states have shared owners:
 * - `Skeleton` (`@ui/primitives/skeleton`) for a placeholder block
 * - `StatusDot` (`@ui/primitives/status-dot`) for a live dot or caret
 * - `Button isPulsing` for a control that needs attention
 * - `Spinner` (`@ui/primitives/spinner`) or `Button isLoading` for a loading spinner
 *
 * `animate-pulse` and `animate-spin` outside the package are findings. A
 * non-loading icon rotation (refresh while refetching) takes
 * `ui-guard-allow:loading-spinner -- <reason>`.
 */
const area: HandBuiltArea = {
  id: 'loading',
  scan: (source) => {
    if (SHARED_PACKAGE.test(source.file)) {
      return [];
    }
    const findings: ReturnType<HandBuiltArea['scan']> = [];
    walkJsx(source, (tag, _children, constants) => {
      const utilities = classUtilities(source, tag, constants);
      if (utilities.has('animate-pulse')) {
        findings.push(
          ...finding(
            source,
            tag,
            'loading-pulse-hand-built',
            'animate-pulse by hand. Use Skeleton for a placeholder, StatusDot for a live marker, or Button isPulsing.',
          ),
        );
      }
      if (utilities.has('animate-spin')) {
        findings.push(
          ...finding(
            source,
            tag,
            'loading-spinner',
            'animate-spin by hand. Use Spinner or Button isLoading; for a refresh icon that rotates while refetching, add ui-guard-allow:loading-spinner -- <reason>.',
          ),
        );
      }
    });
    return findings;
  },
};

export default area;

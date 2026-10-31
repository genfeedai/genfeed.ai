/**
 * React 19 removed the global JSX namespace from @types/react.
 * This shim restores it for packages that use `JSX.Element` without an explicit import.
 */
import type React from 'react';

declare global {
  namespace JSX {
    type Element = React.JSX.Element;
    type ElementClass = React.JSX.ElementClass;
    type IntrinsicElements = React.JSX.IntrinsicElements;
  }
}

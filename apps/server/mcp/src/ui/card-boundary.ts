import type {
  CardBoundaryProps,
  CardBoundaryState,
} from '@mcp/shared/interfaces/mcp-preview.interface';
import { Component, createElement } from 'react';

/**
 * Keeps one card that throws while rendering from blanking the whole view. The
 * hosts show a blank frame for an uncaught render error, so the card falls back
 * to its own text and the other cards stay on screen.
 */
export class CardBoundary extends Component<
  CardBoundaryProps,
  CardBoundaryState
> {
  state: CardBoundaryState = { hasError: false };

  static getDerivedStateFromError(): CardBoundaryState {
    return { hasError: true };
  }

  render() {
    // Plain createElement: the unit tests load this file outside the JSX bundle.
    return this.state.hasError
      ? createElement(
          'p',
          { className: 'whitespace-pre-wrap text-sm', role: 'status' },
          this.props.fallback || 'This card could not be shown.',
        )
      : this.props.children;
  }
}

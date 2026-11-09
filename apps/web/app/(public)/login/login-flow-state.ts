import type {
  LoginErrorMethod,
  LoginFlowAction,
  LoginFlowState,
  LoginSubmitMethod,
} from '@/features/auth/props/login-better-auth.props';

export const LOGIN_FLOW_IDLE: LoginFlowState = { status: 'idle' };

/**
 * Starts the login flow, showing an OAuth error the provider bounced back
 * with (`?error=`) on the chooser.
 */
export function createLoginFlowState(
  socialErrorMessage: string | null,
): LoginFlowState {
  return socialErrorMessage
    ? { message: socialErrorMessage, method: 'social', status: 'error' }
    : LOGIN_FLOW_IDLE;
}

/**
 * Login and desktop sign-in flow (#9742). Starting any attempt clears the
 * previous error; a failure ends the attempt with one error for its surface.
 */
export function loginFlowReducer(
  state: LoginFlowState,
  action: LoginFlowAction,
): LoginFlowState {
  switch (action.type) {
    case 'submit':
      return { method: action.method, status: 'submitting' };
    case 'fail':
      return {
        message: action.message,
        method: action.method,
        status: 'error',
      };
    case 'link_sent':
      return { status: 'link_sent' };
    case 'wait_for_desktop_session':
      return {
        errorMessage: action.errorMessage ?? null,
        status: 'waiting_desktop_session',
      };
    case 'desktop_bridge_ready':
      if (state.status === 'error' && state.method === 'desktop') {
        return LOGIN_FLOW_IDLE;
      }
      if (state.status === 'waiting_desktop_session' && state.errorMessage) {
        return { errorMessage: null, status: 'waiting_desktop_session' };
      }
      return state;
    case 'reset':
      return LOGIN_FLOW_IDLE;
  }
}

export function isLoginSubmitting(
  state: LoginFlowState,
  method: LoginSubmitMethod,
): boolean {
  return state.status === 'submitting' && state.method === method;
}

/** The pasted-code form shows while waiting and while a code is submitted. */
export function isWaitingForDesktopSession(state: LoginFlowState): boolean {
  return (
    state.status === 'waiting_desktop_session' ||
    isLoginSubmitting(state, 'desktop_code')
  );
}

/** The error a surface shows, or null when the flow's error is elsewhere. */
export function getLoginErrorMessage(
  state: LoginFlowState,
  method: LoginErrorMethod,
): string | null {
  if (state.status === 'error' && state.method === method) {
    return state.message;
  }
  if (method === 'desktop' && state.status === 'waiting_desktop_session') {
    return state.errorMessage;
  }
  return null;
}

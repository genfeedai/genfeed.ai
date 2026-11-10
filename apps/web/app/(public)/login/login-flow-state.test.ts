import { describe, expect, it } from 'vitest';
import type {
  LoginErrorMethod,
  LoginFlowAction,
  LoginFlowState,
} from '@/features/auth/props/login-better-auth.props';
import {
  createLoginFlowState,
  getLoginErrorMessage,
  isLoginSubmitting,
  isWaitingForDesktopSession,
  LOGIN_FLOW_IDLE,
  loginFlowReducer,
} from './login-flow-state';

const SOCIAL_ERROR: LoginFlowState = {
  message: 'Google sign-in was interrupted.',
  method: 'social',
  status: 'error',
};
const DESKTOP_ERROR: LoginFlowState = {
  message: 'Bridge missing.',
  method: 'desktop',
  status: 'error',
};
const WAITING: LoginFlowState = {
  errorMessage: null,
  status: 'waiting_desktop_session',
};
const WAITING_WITH_ERROR: LoginFlowState = {
  errorMessage: 'Code expired.',
  status: 'waiting_desktop_session',
};
const SUBMITTING_CODE: LoginFlowState = {
  method: 'desktop_code',
  status: 'submitting',
};

describe('createLoginFlowState', () => {
  it.each([
    [null, LOGIN_FLOW_IDLE],
    ['Google sign-in was interrupted.', SOCIAL_ERROR],
  ])('starts from the bounced OAuth error %s', (message, expected) => {
    expect(createLoginFlowState(message)).toEqual(expected);
  });
});

describe('loginFlowReducer', () => {
  it.each<[string, LoginFlowState, LoginFlowAction, LoginFlowState]>([
    [
      'starting an attempt clears a previous error',
      SOCIAL_ERROR,
      { method: 'magic_link', type: 'submit' },
      { method: 'magic_link', status: 'submitting' },
    ],
    [
      'a failure ends the attempt with one error',
      { method: 'password', status: 'submitting' },
      { message: 'Invalid password', method: 'password', type: 'fail' },
      { message: 'Invalid password', method: 'password', status: 'error' },
    ],
    [
      'a sent magic link replaces the attempt',
      { method: 'magic_link', status: 'submitting' },
      { type: 'link_sent' },
      { status: 'link_sent' },
    ],
    [
      'opening the system browser waits for the desktop session',
      DESKTOP_ERROR,
      { type: 'wait_for_desktop_session' },
      WAITING,
    ],
    [
      'a rejected code keeps waiting with its error',
      SUBMITTING_CODE,
      { errorMessage: 'Code expired.', type: 'wait_for_desktop_session' },
      WAITING_WITH_ERROR,
    ],
    [
      'a failed session confirmation ends a submitted code',
      SUBMITTING_CODE,
      {
        message: 'Session not confirmed.',
        method: 'desktop',
        type: 'fail',
      },
      { message: 'Session not confirmed.', method: 'desktop', status: 'error' },
    ],
    [
      'a ready bridge clears a desktop error',
      DESKTOP_ERROR,
      { type: 'desktop_bridge_ready' },
      LOGIN_FLOW_IDLE,
    ],
    [
      'a ready bridge clears a code error but keeps waiting',
      WAITING_WITH_ERROR,
      { type: 'desktop_bridge_ready' },
      WAITING,
    ],
    [
      'a ready bridge leaves a social error alone',
      SOCIAL_ERROR,
      { type: 'desktop_bridge_ready' },
      SOCIAL_ERROR,
    ],
    [
      'going back returns to idle',
      WAITING_WITH_ERROR,
      { type: 'reset' },
      LOGIN_FLOW_IDLE,
    ],
  ])('%s', (_name, state, action, expected) => {
    expect(loginFlowReducer(state, action)).toEqual(expected);
  });
});

describe('login flow selectors', () => {
  it.each<[LoginFlowState, LoginErrorMethod, string | null]>([
    [SOCIAL_ERROR, 'social', 'Google sign-in was interrupted.'],
    [SOCIAL_ERROR, 'magic_link', null],
    [SOCIAL_ERROR, 'password', null],
    [SOCIAL_ERROR, 'desktop', null],
    [DESKTOP_ERROR, 'desktop', 'Bridge missing.'],
    [WAITING_WITH_ERROR, 'desktop', 'Code expired.'],
    [WAITING_WITH_ERROR, 'social', null],
    [SUBMITTING_CODE, 'desktop', null],
  ])(
    'shows the error of %o on the %s surface as %s',
    (state, method, expected) => {
      expect(getLoginErrorMessage(state, method)).toBe(expected);
    },
  );

  it.each<[LoginFlowState, boolean]>([
    [LOGIN_FLOW_IDLE, false],
    [WAITING, true],
    [WAITING_WITH_ERROR, true],
    [SUBMITTING_CODE, true],
    [{ method: 'local', status: 'submitting' }, false],
    [DESKTOP_ERROR, false],
  ])('shows the code form for %o: %s', (state, expected) => {
    expect(isWaitingForDesktopSession(state)).toBe(expected);
  });

  it.each<[LoginFlowState, boolean]>([
    [{ method: 'password', status: 'submitting' }, true],
    [{ method: 'magic_link', status: 'submitting' }, false],
    [{ message: 'x', method: 'password', status: 'error' }, false],
  ])('locks the password form for %o: %s', (state, expected) => {
    expect(isLoginSubmitting(state, 'password')).toBe(expected);
  });
});

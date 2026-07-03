'use client';

import type { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { useCallback, useReducer } from 'react';

interface CreateOrganizationState {
  createError: string | null;
  description: string;
  isCreating: boolean;
  isOpen: boolean;
  label: string;
}

type CreateOrganizationAction =
  | { type: 'SET_OPEN'; isOpen: boolean }
  | { type: 'SET_LABEL'; label: string }
  | { type: 'SET_DESCRIPTION'; description: string }
  | { type: 'VALIDATION_ERROR'; error: string }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_ERROR'; error: string };

const INITIAL_STATE: CreateOrganizationState = {
  createError: null,
  description: '',
  isCreating: false,
  isOpen: false,
  label: '',
};

function createOrganizationReducer(
  state: CreateOrganizationState,
  action: CreateOrganizationAction,
): CreateOrganizationState {
  switch (action.type) {
    case 'SET_OPEN':
      // Reset the form when the modal is dismissed so a reopen starts clean.
      return action.isOpen ? { ...state, isOpen: true } : { ...INITIAL_STATE };
    case 'SET_LABEL':
      return { ...state, label: action.label };
    case 'SET_DESCRIPTION':
      return { ...state, description: action.description };
    case 'VALIDATION_ERROR':
      return { ...state, createError: action.error };
    case 'SUBMIT_START':
      return { ...state, createError: null, isCreating: true };
    case 'SUBMIT_ERROR':
      return { ...state, createError: action.error, isCreating: false };
    default:
      return state;
  }
}

export interface UseCreateOrganizationModalReturn {
  createError: string | null;
  description: string;
  isCreating: boolean;
  isOpen: boolean;
  label: string;
  open: () => void;
  setDescription: (description: string) => void;
  setLabel: (label: string) => void;
  setOpen: (isOpen: boolean) => void;
  submit: () => Promise<void>;
}

/**
 * Focused hook for the "Create Organization" modal owned by OrganizationSwitcher.
 *
 * Groups the modal's five related pieces of state (open, label, description,
 * submitting, error) behind a single reducer so one logical transition dispatches
 * once instead of fanning out into separate `setState` renders. On success it
 * reloads the page to re-sync session-scoped workspace data (same contract as the
 * switch flow), so the form fields are cleared via the reducer's dismiss reset.
 */
export function useCreateOrganizationModal(
  getOrgsService: () => Promise<OrganizationsService>,
): UseCreateOrganizationModalReturn {
  const [state, dispatch] = useReducer(
    createOrganizationReducer,
    INITIAL_STATE,
  );

  const setOpen = useCallback((isOpen: boolean) => {
    dispatch({ isOpen, type: 'SET_OPEN' });
  }, []);

  const open = useCallback(() => {
    dispatch({ isOpen: true, type: 'SET_OPEN' });
  }, []);

  const setLabel = useCallback((label: string) => {
    dispatch({ label, type: 'SET_LABEL' });
  }, []);

  const setDescription = useCallback((description: string) => {
    dispatch({ description, type: 'SET_DESCRIPTION' });
  }, []);

  const submit = useCallback(async () => {
    const trimmedLabel = state.label.trim();
    if (!trimmedLabel) {
      dispatch({
        error: 'Organization name is required',
        type: 'VALIDATION_ERROR',
      });
      return;
    }
    dispatch({ type: 'SUBMIT_START' });
    try {
      const svc = await getOrgsService();
      await svc.createOrganization({
        description: state.description.trim() || undefined,
        label: trimmedLabel,
      });
      // Close + clear the form, then reload to re-sync session-scoped
      // workspace data for the new org (same contract as the switch flow).
      dispatch({ isOpen: false, type: 'SET_OPEN' });
      window.location.reload();
    } catch {
      dispatch({
        error: 'Failed to create organization',
        type: 'SUBMIT_ERROR',
      });
    }
  }, [getOrgsService, state.description, state.label]);

  return {
    createError: state.createError,
    description: state.description,
    isCreating: state.isCreating,
    isOpen: state.isOpen,
    label: state.label,
    open,
    setDescription,
    setLabel,
    setOpen,
    submit,
  };
}

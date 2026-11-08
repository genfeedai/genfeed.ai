'use client';

import {
  type CreateOrganizationFormValues,
  createOrganizationSchema,
} from '@genfeedai/client/schemas';
import { getJsonApiErrorMember } from '@genfeedai/services/core/json-api-error-message';
import type { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { useCallback, useMemo, useReducer } from 'react';

export type CreateOrganizationField = keyof CreateOrganizationFormValues;

export type CreateOrganizationFieldErrors = Partial<
  Record<CreateOrganizationField, string>
>;

interface CreateOrganizationState {
  createError: string | null;
  hasSubmitted: boolean;
  isCreating: boolean;
  touched: Partial<Record<CreateOrganizationField, boolean>>;
  values: CreateOrganizationFormValues;
}

type CreateOrganizationAction =
  | { type: 'RESET' }
  | { type: 'SET_FIELD'; field: CreateOrganizationField; value: string }
  | { type: 'TOUCH_FIELD'; field: CreateOrganizationField }
  | { type: 'SUBMIT_INVALID' }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_ERROR'; error: string };

const INITIAL_STATE: CreateOrganizationState = {
  createError: null,
  hasSubmitted: false,
  isCreating: false,
  touched: {},
  values: { description: '', label: '', websiteUrl: '' },
};

function createOrganizationReducer(
  state: CreateOrganizationState,
  action: CreateOrganizationAction,
): CreateOrganizationState {
  switch (action.type) {
    case 'RESET':
      return INITIAL_STATE;
    case 'SET_FIELD':
      // Editing a field clears a stale server error: it described the old values.
      return {
        ...state,
        createError: null,
        touched: { ...state.touched, [action.field]: true },
        values: { ...state.values, [action.field]: action.value },
      };
    case 'TOUCH_FIELD':
      return {
        ...state,
        touched: { ...state.touched, [action.field]: true },
      };
    case 'SUBMIT_INVALID':
      return { ...state, hasSubmitted: true };
    case 'SUBMIT_START':
      return {
        ...state,
        createError: null,
        hasSubmitted: true,
        isCreating: true,
      };
    case 'SUBMIT_ERROR':
      return { ...state, createError: action.error, isCreating: false };
    default:
      return state;
  }
}

export interface UseCreateOrganizationModalReturn {
  createError: string | null;
  /** Errors for fields the user has touched (all fields after a submit). */
  fieldErrors: CreateOrganizationFieldErrors;
  isCreating: boolean;
  /** False while any field fails `createOrganizationSchema`; locks submit. */
  isValid: boolean;
  /** Clears the form, e.g. when the dialog is dismissed. */
  reset: () => void;
  setField: (field: CreateOrganizationField, value: string) => void;
  submit: () => Promise<void>;
  touchField: (field: CreateOrganizationField) => void;
  values: CreateOrganizationFormValues;
}

/**
 * Form state for the "Create Organization" dialog (`CreateOrganizationDialog`).
 *
 * Validates with `createOrganizationSchema`, the zod mirror of the API's
 * `CreateOrganizationRequestDto`: only the name is required, and description
 * and website are optional. Field errors appear once a field is touched, while
 * `isValid` locks submit from the start. On success it hands the new
 * organization's slug to `onCreated`, which navigates into it (the API makes the
 * new organization the active one).
 */
export function useCreateOrganizationModal(
  getOrgsService: () => Promise<OrganizationsService>,
  onCreated: (organizationSlug: string) => void,
): UseCreateOrganizationModalReturn {
  const [state, dispatch] = useReducer(
    createOrganizationReducer,
    INITIAL_STATE,
  );

  const parsed = useMemo(
    () => createOrganizationSchema.safeParse(state.values),
    [state.values],
  );

  const fieldErrors = useMemo(() => {
    const errors: CreateOrganizationFieldErrors = {};

    if (parsed.success) {
      return errors;
    }

    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as CreateOrganizationField | undefined;

      if (
        field &&
        !errors[field] &&
        (state.hasSubmitted || state.touched[field])
      ) {
        errors[field] = issue.message;
      }
    }

    return errors;
  }, [parsed, state.hasSubmitted, state.touched]);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const setField = useCallback(
    (field: CreateOrganizationField, value: string) => {
      dispatch({ field, type: 'SET_FIELD', value });
    },
    [],
  );

  const touchField = useCallback((field: CreateOrganizationField) => {
    dispatch({ field, type: 'TOUCH_FIELD' });
  }, []);

  const submit = useCallback(async () => {
    if (!parsed.success) {
      dispatch({ type: 'SUBMIT_INVALID' });
      return;
    }

    dispatch({ type: 'SUBMIT_START' });
    try {
      const svc = await getOrgsService();
      const created = await svc.createOrganization(parsed.data);
      onCreated(created.organization.slug);
      dispatch({ type: 'RESET' });
    } catch (error) {
      // Surface the server's reason (e.g. the plan's organization limit)
      // rather than a generic failure.
      dispatch({
        error:
          getJsonApiErrorMember(error)?.detail?.trim() ||
          'Could not create the organization. Try again.',
        type: 'SUBMIT_ERROR',
      });
    }
  }, [getOrgsService, onCreated, parsed]);

  return {
    createError: state.createError,
    fieldErrors,
    isCreating: state.isCreating,
    isValid: parsed.success,
    reset,
    setField,
    submit,
    touchField,
    values: state.values,
  };
}

'use client';
// packages/features/auth/src/hooks/useAuthPartner.ts

/**
 * @fileoverview useAuthPartner Hook
 * @description Custom hook for individual auth partner state management
 *
 * **Features:**
 * - Partner-specific state management
 * - Error handling
 * - Loading states
 * - Clean API for partner buttons
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useCallback } from 'react';

import type { AuthPartnerId, AuthResult } from '@donotdev/core';

import type { AuthMethod } from '../constants';
import { useAuth } from '../useAuth';

interface UseAuthPartnerOptions {
  onSuccess?: (result: AuthResult) => void;
  onError?: (error: Error) => void;
}

interface UseAuthPartnerReturn {
  // State
  partnerState: string;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  hasError: boolean;
  error: Error | null;

  // Actions
  handleSignIn: (method: AuthMethod) => Promise<void>;
  clearError: () => void;
  setLoading: () => void;
  setIdle: () => void;
}

/**
 * Custom hook for individual auth partner management
 *
 * **Features:**
 * - Partner-specific state tracking
 * - Error handling and clearing
 * - Loading state management
 * - Clean sign-in API
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * **Usage:**
 * ```tsx
 * function GoogleButton() {
 *   const { isAuthenticating, handleSignIn, hasError, clearError } = useAuthPartner('google');
 *
 *   return (
 *     <button
 *       onClick={() => handleSignIn('popup')}
 *       disabled={isAuthenticating}
 *     >
 *       {isAuthenticating ? 'Signing in...' : 'Sign in with Google'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useAuthPartner(
  partnerId: AuthPartnerId,
  options: UseAuthPartnerOptions = {}
): UseAuthPartnerReturn {
  const getPartnerState = useAuth('getPartnerState');
  const setPartnerState = useAuth('setPartnerState');
  const signInWithPartner = useAuth('signInWithPartner');
  const partnerError = useAuth('partnerError');
  const { onSuccess, onError } = options;

  // Get partner-specific state
  const partnerState = getPartnerState(partnerId);
  const isAuthenticated = partnerState === 'authenticated';
  const isAuthenticating = partnerState === 'loading';
  const hasError = partnerError?.partnerId === partnerId;
  const error: Error | null =
    hasError && partnerError?.error ? new Error(partnerError.error) : null;

  // Clear partner error
  const clearError = useCallback(() => {
    if (hasError) {
      setPartnerState(partnerId, 'idle');
    }
  }, [hasError, partnerId, setPartnerState]);

  // Set loading state
  const setLoading = useCallback(() => {
    setPartnerState(partnerId, 'loading');
  }, [partnerId, setPartnerState]);

  // Set idle state
  const setIdle = useCallback(() => {
    setPartnerState(partnerId, 'idle');
  }, [partnerId, setPartnerState]);

  // Handle sign in
  const handleSignIn = useCallback(
    async (method: AuthMethod) => {
      // Clear any existing errors
      if (hasError) {
        clearError();
      }

      try {
        // Set partner as loading
        setPartnerState(partnerId, 'loading');

        // Call the auth service
        const result = await signInWithPartner(partnerId, method);

        // Check if account linking is required (result is null)
        if (result === null) {
          setPartnerState(partnerId, 'idle');
          return;
        }

        // Call success callback if provided
        if (result && onSuccess) {
          onSuccess(result);
        }
      } catch (error: any) {
        // Set error state
        setPartnerState(partnerId, 'error', error);

        // Call error callback if provided
        if (onError) {
          onError(error);
        }
      }
    },
    [
      partnerId,
      hasError,
      clearError,
      setPartnerState,
      signInWithPartner,
      onSuccess,
      onError,
    ]
  );

  return {
    // State
    partnerState,
    isAuthenticated,
    isAuthenticating,
    hasError,
    error,

    // Actions
    handleSignIn,
    clearError,
    setLoading,
    setIdle,
  };
}

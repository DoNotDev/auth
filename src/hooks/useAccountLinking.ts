'use client';
// packages/features/auth/src/hooks/useAccountLinking.ts

/**
 * @fileoverview useAccountLinking Hook
 * @description Custom hook for account linking state management
 *
 * **Features:**
 * - SessionStorage management
 * - Account linking state parsing
 * - Provider type detection
 * - SSR-safe initialization
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useState, useEffect, useCallback } from 'react';

import {
  safeSessionStorage,
  handleError,
  isClient,
  isDev,
  type AuthPartnerId,
} from '@donotdev/core';

import { getAuthMethod } from '../constants';
import { useAuth } from '../useAuth';

interface AccountLinkingInfo {
  isRequired: boolean;
  email: string;
  existingProvider: AuthPartnerId;
  newProvider: AuthPartnerId;
  timestamp: number;
}

interface UseAccountLinkingReturn {
  accountLinking: AccountLinkingInfo | null;
  isRequired: boolean;
  email: string | null;
  existingProvider: AuthPartnerId | null;
  newProvider: AuthPartnerId | null;
  handleSignInWithExistingProvider: () => Promise<void>;
  clearAccountLinking: () => void;
}

/**
 * Custom hook for account linking management
 *
 * **Features:**
 * - Parses sessionStorage for account linking info
 * - Handles provider type detection
 * - Provides sign-in actions
 * - SSR-safe initialization
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * **Usage:**
 * ```tsx
 * function AccountLinkingComponent() {
 *   const { isRequired, email, existingProvider, handleSignIn } = useAccountLinking();
 *
 *   if (!isRequired) return null;
 *
 *   return (
 *     <div>
 *       <p>Link {email} with {existingProvider}</p>
 *       <button onClick={handleSignIn}>Continue</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useAccountLinking(): UseAccountLinkingReturn {
  const signInWithPartner = useAuth('signInWithPartner');
  const user = useAuth('user');
  const [accountLinking, setAccountLinking] =
    useState<AccountLinkingInfo | null>(null);

  // Parse account linking info from sessionStorage
  // Only check when user exists or when explicitly needed (during account linking flow)
  useEffect(() => {
    if (!isClient()) return;

    try {
      const linkingData = safeSessionStorage.getItem('accountLinkingInfo');
      if (linkingData) {
        const parsed = JSON.parse(linkingData);
        setAccountLinking(parsed);
      } else {
        // Only log if user exists (during normal auth flow, not during sign out)
        // This prevents noise during sign out when user is null
        if (user) {
          // Debug log only when user exists - this is expected during sign out
          // console.log('[useAccountLinking] No accountLinkingInfo found in sessionStorage');
        }
      }
    } catch (error) {
      if (isDev()) {
        console.warn(
          '[useAccountLinking] Failed to parse account linking info:',
          error
        );
      }
    }

    // Cleanup: Clear stale linking info on unmount if user navigates away
    return () => {
      if (!isClient()) return;
      // Only clear if linking is not required (user completed or cancelled)
      const linkingData = safeSessionStorage.getItem('accountLinkingInfo');
      if (linkingData) {
        try {
          const parsed = JSON.parse(linkingData);
          if (!parsed.isRequired) {
            safeSessionStorage.removeItem('accountLinkingInfo');
          }
        } catch {
          // Ignore parse errors during cleanup
        }
      }
    };
  }, [user]);

  // Handle sign in with existing provider
  const handleSignInWithExistingProvider = useCallback(async () => {
    if (!accountLinking || !accountLinking.isRequired) return;

    try {
      const { existingProvider } = accountLinking;

      if (existingProvider === 'password' || existingProvider === 'emailLink') {
        if (isDev()) {
          console.log(
            '[useAccountLinking] Email provider - showing manual sign-in UI'
          );
        }
        // Email provider requires manual sign-in UI
        // This should be handled by the component
        return;
      }

      // OAuth provider - automatic redirect
      if (isDev()) {
        console.log(
          `[useAccountLinking] OAuth provider ${existingProvider} - initiating sign-in`
        );
      }
      // Use getAuthMethod() for consistency (defaults to popup in dev, redirect in prod)
      await signInWithPartner(existingProvider, getAuthMethod());
    } catch (error) {
      handleError(error);
    }
  }, [accountLinking, signInWithPartner]);

  // Clear account linking info
  const clearAccountLinking = useCallback(() => {
    if (!isClient()) return;

    safeSessionStorage.removeItem('accountLinkingInfo');
    setAccountLinking(null);
  }, []);

  // Computed values
  const isRequired = accountLinking?.isRequired || false;
  const email = accountLinking?.email || null;
  const existingProvider = accountLinking?.existingProvider || null;
  const newProvider = accountLinking?.newProvider || null;

  return {
    accountLinking,
    isRequired,
    email,
    existingProvider,
    newProvider,
    handleSignInWithExistingProvider,
    clearAccountLinking,
  };
}

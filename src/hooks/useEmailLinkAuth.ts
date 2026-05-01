'use client';
// packages/features/auth/src/hooks/useEmailLinkAuth.ts

/**
 * @fileoverview useEmailLinkAuth hook
 * @description Hook for handling email link authentication
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useEffect, useState, useCallback } from 'react';

import { handleError, isDev } from '@donotdev/core';

import { useAuth } from '../useAuth';

export interface UseEmailLinkAuthReturn {
  isEmailLink: boolean;
  isProcessing: boolean;
  email: string | null;
  completeEmailLinkSignIn: (email: string) => Promise<void>;
}

/**
 * Hook for handling email link authentication
 *
 * Automatically detects when user returns from email link and provides
 * methods to complete the sign-in process.
 *
 * **Features:**
 * - Auto-detects email link URLs
 * - Stores email in localStorage for completion
 * - Provides completion method
 * - Handles account linking scenarios
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * **Usage:**
 * ```tsx
 * function EmailLinkHandler() {
 *   const { isEmailLink, isProcessing, email, completeEmailLinkSignIn } = useEmailLinkAuth();
 *
 *   if (isEmailLink && email) {
 *     return (
 *       <button onClick={() => completeEmailLinkSignIn(email)}>
 *         Complete Sign-In
 *       </button>
 *     );
 *   }
 *
 *   return null;
 *   }
 * ```
 */
export function useEmailLinkAuth(): UseEmailLinkAuthReturn {
  // Get stable methods
  const isSignInWithEmailLink = useAuth('isSignInWithEmailLink');
  const signInWithEmailLink = useAuth('signInWithEmailLink');
  const [isProcessing, setIsProcessing] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  // Check if current URL is an email link
  const isEmailLink = isSignInWithEmailLink();

  // Get stored email from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedEmail = localStorage.getItem('emailForSignIn');
      if (storedEmail) {
        setEmail(storedEmail);
      }
    }
  }, []);

  // Complete email link sign-in
  const completeEmailLinkSignIn = useCallback(
    async (emailToUse: string) => {
      if (!emailToUse) {
        if (isDev()) {
          console.warn('[useEmailLinkAuth] No email provided for sign-in');
        }
        return;
      }

      setIsProcessing(true);

      try {
        if (isDev()) {
          console.log('[useEmailLinkAuth] Completing email link sign-in');
        }
        const result = await signInWithEmailLink(emailToUse);

        if (result?.success) {
          // Clear stored email
          localStorage.removeItem('emailForSignIn');
          setEmail(null);
        } else {
        }
      } catch (error) {
        handleError(error);
        // Don't clear email on error - user might want to retry
      } finally {
        setIsProcessing(false);
      }
    },
    [signInWithEmailLink]
  );

  return {
    isEmailLink,
    isProcessing,
    email,
    completeEmailLinkSignIn,
  };
}

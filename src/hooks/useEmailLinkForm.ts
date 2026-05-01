'use client';
// packages/features/auth/src/hooks/useEmailLinkForm.ts

/**
 * @fileoverview useEmailLinkForm hook
 * @description Custom hook for email link form state management
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useState, useCallback } from 'react';

import { handleError } from '@donotdev/core';

import { useAuth } from '../useAuth';

/**
 * Use email link form return interface
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface UseEmailLinkFormReturn {
  // Form state
  email: string;
  setEmail: (email: string) => void;
  isLoading: boolean;
  isSent: boolean;
  error: string | null;

  // Actions
  handleSendLink: (e: React.FormEvent) => Promise<void>;
  handleResend: () => void;
  clearError: () => void;

  // Validation
  isValid: boolean;
  canSubmit: boolean;
}

/**
 * Use email link form options interface
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface UseEmailLinkFormOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  actionCodeSettings?: {
    url: string;
    handleCodeInApp: boolean;
  };
}

/**
 * Custom hook for email link form state management
 *
 * Handles the complete email link flow:
 * 1. Form state management (email, loading, sent, error)
 * 2. Email validation
 * 3. Sending magic link via Firebase
 * 4. Success/error handling
 * 5. Resend functionality
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 *
 * **Features:**
 * - Form validation
 * - Loading states
 * - Error handling
 * - Success callbacks
 * - Resend functionality
 *
 * **Usage:**
 * ```tsx
 * function EmailLinkForm() {
 *   const {
 *     email,
 *     setEmail,
 *     isLoading,
 *     isSent,
 *     error,
 *     handleSendLink,
 *     handleResend,
 *     canSubmit
 *   } = useEmailLinkForm({
 *     onSuccess: () => console.log('Link sent!'),
 *     onError: (err) => console.error('Failed:', err)
 *   });
 *
 *   return (
 *     <form onSubmit={handleSendLink}>
 *       <input value={email} onChange={(e) => setEmail(e.target.value)} />
 *       <button disabled={!canSubmit}>Send Link</button>
 *     </form>
 *   );
 * }
 * ```
 */
export function useEmailLinkForm(
  options: UseEmailLinkFormOptions = {}
): UseEmailLinkFormReturn {
  // Get stable method and utility
  const sendSignInLinkToEmail = useAuth('sendSignInLinkToEmail');
  const isAvailable = useAuth('isAvailable');
  const { onSuccess, onError, actionCodeSettings } = options;

  // Form state
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validation
  const isValid = email.trim().length > 0 && email.includes('@');
  const canSubmit = isValid && !isLoading && isAvailable;

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Handle form submission
  const handleSendLink = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!isValid) {
        setError('Please enter a valid email address');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Store email in localStorage for completion
        if (typeof window !== 'undefined') {
          localStorage.setItem('emailForSignIn', email.trim());
        }

        await sendSignInLinkToEmail(email.trim(), actionCodeSettings);
        setIsSent(true);
        onSuccess?.();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to send sign-in link';
        setError(errorMessage);
        onError?.(err as Error);
        handleError(err);
      } finally {
        setIsLoading(false);
      }
    },
    [
      email,
      isValid,
      sendSignInLinkToEmail,
      actionCodeSettings,
      onSuccess,
      onError,
    ]
  );

  // Handle resend
  const handleResend = useCallback(() => {
    setIsSent(false);
    setError(null);
  }, []);

  return {
    // Form state
    email,
    setEmail,
    isLoading,
    isSent,
    error,

    // Actions
    handleSendLink,
    handleResend,
    clearError,

    // Validation
    isValid,
    canSubmit,
  };
}

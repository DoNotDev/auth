'use client';
// packages/features/auth/src/hooks/useAuthMethodToggle.ts

/**
 * @fileoverview useAuthMethodToggle Hook
 * @description Custom hook for auth method toggle (popup/redirect) management
 *
 * **Features:**
 * - Simple component state (no persistence)
 * - Toggle state management
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useState, useCallback } from 'react';

import type { AuthMethod } from '../constants';

interface UseAuthMethodToggleOptions {
  defaultValue?: AuthMethod;
}

interface UseAuthMethodToggleReturn {
  isRedirectMode: boolean;
  isPopupMode: boolean;
  authMethod: AuthMethod;
  toggleMode: () => void;
  setRedirectMode: () => void;
  setPopupMode: () => void;
  handleToggleChange: (checked: boolean) => void;
}

/**
 * Custom hook for auth method toggle management
 *
 * **Features:**
 * - Simple component state (no persistence)
 * - Clean toggle API
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * **Usage:**
 * ```tsx
 * function AuthToggle() {
 *   const { isRedirectMode, toggleMode, handleToggleChange } = useAuthMethodToggle({
 *     defaultValue: 'popup'
 *   });
 *
 *   return (
 *     <Switch
 *       checked={isRedirectMode}
 *       onCheckedChange={handleToggleChange}
 *     />
 *   );
 * }
 * ```
 */
export function useAuthMethodToggle({
  defaultValue = 'popup',
}: UseAuthMethodToggleOptions = {}): UseAuthMethodToggleReturn {
  const [authMethod, setAuthMethod] = useState<AuthMethod>(defaultValue);

  // Computed values
  const isRedirectMode = authMethod === 'redirect';
  const isPopupMode = authMethod === 'popup';

  // Toggle between popup and redirect
  const toggleMode = useCallback(() => {
    setAuthMethod((current) => (current === 'redirect' ? 'popup' : 'redirect'));
  }, []);

  // Set specific modes
  const setRedirectMode = useCallback(() => {
    setAuthMethod('redirect');
  }, []);

  const setPopupMode = useCallback(() => {
    setAuthMethod('popup');
  }, []);

  // Handle toggle change (for Switch components)
  const handleToggleChange = useCallback((checked: boolean) => {
    setAuthMethod(checked ? 'redirect' : 'popup');
  }, []);

  return {
    isRedirectMode,
    isPopupMode,
    authMethod,
    toggleMode,
    setRedirectMode,
    setPopupMode,
    handleToggleChange,
  };
}

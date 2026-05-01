// packages/features/auth/src/components/AuthFallback.tsx

/**
 * @fileoverview Auth Fallback Component
 * @description Graceful fallback when auth is not available or fails to load
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { FeatureFallback, withFeatureFallback } from '@donotdev/components';
import { isFeatureAvailable, FRAMEWORK_FEATURES } from '@donotdev/core';

import type { ComponentType } from 'react';

interface AuthFallbackProps {
  /** Custom message to display */
  message?: string;
  /** Whether to show a login button (will be disabled) */
  showLoginButton?: boolean;
  /** Custom CSS class */
  className?: string;
}

/**
 * Graceful fallback component when auth is not available
 * Prevents app crashes and provides clear feedback to users
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function AuthFallback({
  message = 'Authentication is not available',
  showLoginButton = false,
  className = '',
}: AuthFallbackProps) {
  return (
    <FeatureFallback
      featureName="Authentication"
      message={message}
      icon="🔒"
      showActionButton={showLoginButton}
      actionButtonText="Sign In (Unavailable)"
      className={className}
      helpText="This feature requires authentication to be configured."
    />
  );
}

/**
 * Higher-order component that wraps auth components
 * Automatically shows AuthFallback when auth is not available
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * @param Component The auth component to wrap
 * @param fallbackProps Props to pass to AuthFallback
 * @returns Wrapped component that handles auth availability
 */
export function withAuthFallback<P extends object>(
  Component: ComponentType<P>,
  fallbackProps?: Omit<AuthFallbackProps, 'className'>
) {
  return withFeatureFallback(
    Component,
    'Authentication',
    () => isFeatureAvailable(FRAMEWORK_FEATURES.AUTH),
    {
      message: fallbackProps?.message,
      showActionButton: fallbackProps?.showLoginButton,
      actionButtonText: 'Sign In (Unavailable)',
      icon: '🔒',
      helpText: 'This feature requires authentication to be configured.',
    }
  );
}

/**
 * Hook that returns either the component or AuthFallback
 *
 * @param fallbackProps Props to pass to AuthFallback
 * @returns Object with component and fallback for conditional rendering
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function useAuthComponent(
  fallbackProps?: Omit<AuthFallbackProps, 'className'>
) {
  const isAuthAvailable = isFeatureAvailable(FRAMEWORK_FEATURES.AUTH);

  return {
    isAuthAvailable,
    AuthFallbackComponent: () => <AuthFallback {...fallbackProps} />,
  };
}

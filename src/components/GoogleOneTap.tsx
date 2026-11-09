'use client';
// packages/features/auth/src/components/GoogleOneTap.tsx

/**
 * @fileoverview GoogleOneTap Component - October 2025 FedCM Mandatory
 *
 * @description
 * Modern Google One Tap component with mandatory FedCM compliance.
 * Shows browser compatibility message if FedCM not supported.
 *
 * **Key Features:**
 * - FedCM mandatory (no fallback)
 * - Clear browser compatibility messaging
 * - CSR/SSR safe with proper hydration
 * - Framework-native UI components
 * - Clean error states
 *
 * **Browser Support:**
 * - ✅ Chrome 116+
 * - ✅ Edge 116+
 * - ❌ Safari (not yet supported)
 * - ❌ Firefox (not yet supported)
 *
 * **Usage:**
 * ```tsx
 * <GoogleOneTap
 * onSuccess={(credential) => console.log('Signed in')}
 * onError={(error) => console.error(error)}
 * />
 * ```
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { ComponentType } from 'react';

import { Card, Spinner, Stack } from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

import { useGoogleOneTap } from '../hooks/useGoogleOneTap';

/**
 * Component props
 */
interface GoogleOneTapProps {
  /** OAuth client ID (optional, reads from config) */
  clientId?: string;

  /** Success callback with credential */
  onSuccess?: (credential: string) => void;

  /** Error callback */
  onError?: (error: Error) => void;

  /** Whether to auto-select returning users */
  autoSelect?: boolean;

  /** Whether to cancel on tap outside */
  cancelOnTapOutside?: boolean;

  /** Additional CSS classes */
  className?: string;

  /** Whether component is disabled */
  disabled?: boolean;

  /** Optional parent element ID for prompt */
  promptParentId?: string;

  /** Optional allowed parent origins */
  allowedParentOrigins?: string[];

  /** Optional CSP nonce */
  cspNonce?: string;

  /** Whether to only show after client hydration */
  clientOnly?: boolean;

  /** Whether to show detailed error messages */
  showErrorDetails?: boolean;

  /** Custom loading component */
  loadingComponent?: ComponentType;

  /** Custom error component */
  errorComponent?: ComponentType<{ error: Error }>;

  /** Custom browser not supported component */
  browserNotSupportedComponent?: ComponentType<{
    browserInfo: {
      name: string;
      isSupported: boolean;
      recommendation: string;
    };
  }>;
}

/**
 * Google One Tap authentication component
 *
 * @description
 * Displays Google One Tap prompt for seamless authentication.
 * As of October 2024, FedCM is mandatory - shows clear browser
 * compatibility message if not supported.
 *
 * **Positioning:**
 * Fixed to top-right, below header/breadcrumbs automatically.
 *
 * **States:**
 * - Loading: Shows spinner while initializing
 * - Error: Shows error message with details
 * - Not Supported: Shows browser upgrade message
 * - Ready: Invisible container for Google prompt
 *
 * @param props - Component configuration
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
function GoogleOneTap({
  clientId,
  onSuccess,
  onError,
  autoSelect = true,
  cancelOnTapOutside = true,
  className = '',
  disabled = false,
  promptParentId,
  allowedParentOrigins,
  cspNonce,
  clientOnly = false,
  showErrorDetails = false,
  loadingComponent: LoadingComponent,
  errorComponent: ErrorComponent,
  browserNotSupportedComponent: BrowserNotSupportedComponent,
}: GoogleOneTapProps) {
  const { t } = useTranslation('auth');

  const {
    shouldShow,
    isLoaded,
    isLoading,
    error,
    containerRef,
    fedcmSupported,
    isHydrated,
    browserInfo,
  } = useGoogleOneTap({
    clientId,
    autoSelect,
    cancelOnTapOutside,
    promptParentId,
    disabled,
    onSuccess,
    onError,
    allowedParentOrigins,
    cspNonce,
    clientOnly,
  });

  // Don't render until conditions are met
  if (disabled || !shouldShow || (clientOnly && !isHydrated)) {
    return null;
  }

  // Loading state
  if (isLoading) {
    if (LoadingComponent) {
      return (
        <div
          className="dndev-fixed"
          style={{
            right: 'var(--gap-md)',
            zIndex: 50,
            top: 'calc(1rem + var(--header-height, 0px))',
          }}
        >
          <Card style={{ padding: 'var(--gap-md)' }}>
            <LoadingComponent />
          </Card>
        </div>
      );
    }

    return (
      <div
        className="dndev-fixed"
        style={{
          right: 'var(--gap-md)',
          zIndex: 50,
          top: 'calc(1rem + var(--header-height, 0px))',
        }}
      >
        <Card style={{ padding: 'var(--gap-md)' }}>
          <Stack direction="row" align="center">
            <Spinner />
            <span
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--muted-foreground)',
              }}
            >
              {t('googleOneTapLoading', 'Loading Google One Tap...')}
            </span>
          </Stack>
        </Card>
      </div>
    );
  }

  // If FedCM unsupported, don’t render anything
  if (!fedcmSupported) {
    return null;
  }

  // If any error, don’t render anything (optional component)
  if (error) {
    return null;
  }

  // Ready state - invisible container for Google prompt
  return (
    <div
      className="dndev-fixed"
      style={{
        right: 'var(--gap-md)',
        zIndex: 50,
        top: 'calc(1rem + var(--header-height, 0px))',
      }}
    >
      <div
        ref={containerRef}
        className={`google-one-tap-container ${className}`.trim()}
        data-testid="google-one-tap"
        data-fedcm-supported={fedcmSupported}
        data-hydrated={isHydrated}
        {...(allowedParentOrigins && {
          'data-allowed-parent-origins': allowedParentOrigins.join(','),
        })}
      />
    </div>
  );
}

export default GoogleOneTap;

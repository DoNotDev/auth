'use client';
// packages/features/auth/src/components/MultipleAuthProviders.tsx

/**
 * @fileoverview MultipleAuthProviders component
 * @description Source of truth for sign-in/signup/linking UI
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Suspense, lazy, useId } from 'react';
import type { ComponentType } from 'react';

import { Alert, ALERT_VARIANT, Stack, Grid } from '@donotdev/components';
import {
  useTranslation,
  getEnabledAuthPartners,
  type AuthPartnerId,
} from '@donotdev/core';

import { useAuth } from '../useAuth';
import { withAuthFallback } from './AuthFallback';
import AuthPartnerButton from './AuthPartnerButton';
import { getAuthMethod, type AuthMethod } from '../constants';
import { useAccountLinking } from '../hooks/useAccountLinking';

// Lazy-load linking UI (module-level to avoid re-creation on each render)
const LazyAccountLinking = lazy(() => import('./AccountLinking'));

/**
 * Props for the MultipleAuthProviders component
 */
export interface MultipleAuthProvidersProps {
  /** Providers to display (defaults to all available providers) */
  providers?: AuthPartnerId[];
  /** CSS class for the container element */
  containerClassName?: string;
  /** CSS class for each provider button */
  providerClassName?: string;
  /** Auth method - if not provided, uses getAuthMethod() default (isDev() ? 'popup' : 'redirect') */
  method?: AuthMethod | null;
  /** Button size to use */
  size?: 'sm' | 'md' | 'lg';
  /** Layout of the provider buttons */
  layout?: 'vertical' | 'horizontal' | 'grid';
  /** Whether to show text labels on buttons */
  showLabels?: boolean;
  /** Spacing between buttons */
  spacing?: 'none' | 'tight' | 'medium' | 'large';
  /** Accessible label for the auth providers region */
  ariaLabel?: string;
  /** ID for the component (auto-generated if not provided) */
  id?: string;
  /** Whether buttons should take full width of their container */
  fullWidth?: boolean;
  /** Callback when authentication succeeds */
  onSuccess?: () => void;
}

/**
 * MultipleAuthProviders - Source of truth for sign-in/signup/linking UI
 *
 * Renders provider buttons and error surface. Owns Account Linking UI (lazy-loaded)
 * when linking is required. Reads auth state via useAuth and linking state via useAccountLinking.
 * Avoids static import cycles by dynamically importing AccountLinking.
 *
 * Use this component if you need to render individual authentication partner buttons
 * (e.g., Google, GitHub, etc.) within your own custom authentication UI.
 * For a pre-composed modal, use `LoginModal`. For a full page, use `LoginTemplate` (from `@donotdev/templates`).
 *
 * Performance:
 * - AccountLinking is only loaded when sessionStorage indicates linking is required
 * - Provider list and layout are memo-friendly; keep props stable for parent usage
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
const MultipleAuthProvidersComponent: ComponentType<
  MultipleAuthProvidersProps
> = ({
  providers,
  containerClassName = '',
  providerClassName = '',
  method,
  size = 'md',
  layout = 'vertical',
  showLabels = true,
  spacing = 'medium',
  ariaLabel,
  id,
  fullWidth = true,
  onSuccess,
}) => {
  const { t } = useTranslation('auth');
  const generatedId = useId();
  const componentId = id || generatedId;
  const { isRequired: isLinkingRequired } = useAccountLinking();

  // Get auth state for error display — must be called unconditionally (Rules of Hooks)
  const authError = useAuth('error');
  const isAvailable = useAuth('isAvailable');

  // Use source of truth: isDev() ? 'popup' : 'redirect'
  // Simple function call - no memoization needed (cheaper than useMemo overhead)
  const authMethod = getAuthMethod(method);

  // Get enabled providers from utility (single source of truth)
  // Simple operation - no memoization needed
  const finalProviders = providers || getEnabledAuthPartners();

  // Graceful fallback when no auth providers are available
  if (!finalProviders || finalProviders.length === 0) {
    return (
      <div className={containerClassName}>
        <p>No authentication providers are configured</p>
      </div>
    );
  }

  const renderProviders = () => {
    const content = finalProviders.map(
      (partnerId: AuthPartnerId, index: number) => (
        <AuthPartnerButton
          key={partnerId}
          partnerId={partnerId}
          method={authMethod}
          className={`${providerClassName} ${fullWidth ? 'dndev-w-full' : ''}`}
          tabIndex={index === 0 ? 0 : undefined}
          id={`${componentId}-${partnerId}-button`}
          onSuccess={onSuccess}
        >
          {showLabels ? undefined : null}
        </AuthPartnerButton>
      )
    );

    if (layout === 'grid') {
      return (
        <Grid cols={2} gap={spacing as any} className={containerClassName}>
          {content}
        </Grid>
      );
    }

    return (
      <Stack
        direction={layout === 'horizontal' ? 'row' : 'column'}
        wrap={layout === 'horizontal' ? 'wrap' : undefined}
        gap={spacing as any}
        align={layout === 'horizontal' ? 'center' : 'stretch'}
        className={containerClassName}
      >
        {content}
      </Stack>
    );
  };

  return (
    <Stack
      className="dndev-mx-auto"
      id={componentId}
      role="region"
      aria-label={ariaLabel || t('aria.signInOptions', 'Sign in options')}
    >
      {renderProviders()}

      {/* Centralized Error Display - only show if auth is available */}
      {authError && isAvailable && (
        <Alert
          variant={ALERT_VARIANT.ERROR}
          description={
            authError.message ||
            t('errorGeneric', 'Authentication failed. Please try again.')
          }
        />
      )}

      {/* Account Linking UI (lazy-loaded; rendered only when required) */}
      {isLinkingRequired && (
        <Suspense fallback={null}>
          <LazyAccountLinking />
        </Suspense>
      )}
    </Stack>
  );
};

/**
 * Multiple auth providers component with automatic fallback handling
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
const MultipleAuthProviders = withAuthFallback(MultipleAuthProvidersComponent, {
  message: 'Authentication providers are not configured',
  showLoginButton: true,
});

// Export as default
export default MultipleAuthProviders;

// Named export for testing
export { MultipleAuthProviders };

'use client';
// packages/features/auth/src/components/AccountLinking.tsx

/**
 * @fileoverview AccountLinking component
 * @description Account linking UI for handling multiple authentication providers
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Suspense, lazy } from 'react';

import {
  Alert,
  ALERT_VARIANT,
  Button,
  BUTTON_VARIANT,
  Stack,
} from '@donotdev/components';
import {
  useTranslation,
  safeSessionStorage,
  handleError as handleErrorUtil,
  isDev,
} from '@donotdev/core';

import { EmailLinkForm } from './EmailLinkForm';
import EmailPasswordForm from './EmailPasswordForm';
import { useAccountLinking } from '../hooks/useAccountLinking';

import type { ComponentType } from 'react';

export interface AccountLinkingProps {
  className?: string;
  id?: string;
}

/**
 * AccountLinkingContent - Account linking UI component
 *
 * Handles account linking when users sign in with a different provider than their existing account.
 * Shows appropriate authentication forms based on the existing provider type.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
// Lazy-loaded AccountLinking content component
const AccountLinkingContent: ComponentType<AccountLinkingProps> = ({
  className = '',
  id,
}) => {
  const { t } = useTranslation('auth');
  const {
    isRequired,
    email,
    existingProvider,
    newProvider,
    handleSignInWithExistingProvider,
  } = useAccountLinking();

  // Don't show if account linking is not required
  if (!isRequired) {
    return null;
  }

  // Handle different provider types
  if (existingProvider === 'password' || existingProvider === 'emailLink') {
    // Email authentication - show appropriate form
    if (isDev()) {
      console.log(
        `[AccountLinking] Email provider - showing ${existingProvider} form`
      );
    }

    const handleDismiss = () => {
      // Clear the account linking state from sessionStorage
      safeSessionStorage.removeItem('accountLinkingInfo');
    };

    const handleSuccess = () => {
      if (isDev()) {
        console.log(
          '[AccountLinking] Email sign-in successful, account linking should complete automatically'
        );
      }
      // Account linking will be handled by FirebaseAuth after successful sign-in
    };

    const handleError = (error: Error) => {
      handleErrorUtil(error);
    };

    return (
      <div className={className} id={id}>
        <Alert
          variant={ALERT_VARIANT.WARNING}
          role="alert"
          aria-live="polite"
          title={t('accountLinking.title', 'Account Linking Required')}
          description={
            <Stack>
              <p>
                {t(
                  'accountLinking.message',
                  `An account with email ${email} already exists with ${existingProvider === 'password' ? 'email/password' : 'email link'}. To link your ${newProvider} account, please sign in with your ${existingProvider === 'password' ? 'email and password' : 'email link'} first.`
                )}
              </p>

              {/* Show appropriate form based on provider type */}
              {existingProvider === 'password' ? (
                <div style={{ marginTop: 'var(--gap-md)' }}>
                  <EmailPasswordForm
                    mode="signin"
                    onSuccess={handleSuccess}
                    onError={handleError}
                  />
                </div>
              ) : (
                <div style={{ marginTop: 'var(--gap-md)' }}>
                  <EmailLinkForm
                    onSuccess={handleSuccess}
                    onError={handleError}
                  />
                </div>
              )}

              <Stack direction="row" justify="end">
                <Button onClick={handleDismiss} variant={BUTTON_VARIANT.GHOST}>
                  {t('accountLinking.dismiss', 'Dismiss')}
                </Button>
              </Stack>
            </Stack>
          }
        />
      </div>
    );
  } else {
    // OAuth provider - show automatic redirect UI
    if (isDev()) {
      console.log(
        `[AccountLinking] OAuth provider ${existingProvider} - showing automatic redirect UI`
      );
    }

    const handleDismiss = () => {
      // Clear the account linking state from sessionStorage
      safeSessionStorage.removeItem('accountLinkingInfo');
    };

    return (
      <div className={className} id={id}>
        <Alert
          variant={ALERT_VARIANT.WARNING}
          role="alert"
          aria-live="polite"
          title={t('accountLinking.title', 'Account Linking Required')}
          description={
            <Stack>
              <p>
                {t(
                  'accountLinking.message',
                  `An account with email ${email} already exists with ${existingProvider}. To link your ${newProvider} account, please sign in with ${existingProvider} first.`
                )}
              </p>
              <Stack direction="row">
                <Button
                  onClick={handleSignInWithExistingProvider}
                  variant={BUTTON_VARIANT.PRIMARY}
                >
                  {t(
                    'accountLinking.signInWith',
                    `Sign in with ${existingProvider}`
                  )}
                </Button>
                <Button onClick={handleDismiss} variant={BUTTON_VARIANT.GHOST}>
                  {t('accountLinking.dismiss', 'Dismiss')}
                </Button>
              </Stack>
            </Stack>
          }
        />
      </div>
    );
  }
};

// Lazy load the AccountLinking content
const LazyAccountLinkingContent = lazy(() =>
  Promise.resolve({ default: AccountLinkingContent })
);

// Main AccountLinking component with lazy loading and conditional rendering
function AccountLinking(props: AccountLinkingProps) {
  // Firebase v12.3 approach - no need to check useAuth for accountLinking
  // The AccountLinkingContent component handles sessionStorage directly

  return (
    <Suspense fallback={null}>
      <LazyAccountLinkingContent {...props} />
    </Suspense>
  );
}

// Set display name for debugging

// Export as default
export default AccountLinking;

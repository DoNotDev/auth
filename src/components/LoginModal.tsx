'use client';
// packages/features/auth/src/components/LoginModal.tsx

/**
 * @fileoverview LoginModal component
 * @description Modal dialog for authentication
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Dialog } from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

import { withAuthFallback } from './AuthFallback';
import MultipleAuthProviders from './MultipleAuthProviders';
import type { LoginModalProps } from '../constants';

// Use MultipleAuthProviders directly - no lazy loading needed for small components

/**
 * Modal dialog for authentication
 * Automatically displays enabled authentication provider buttons.
 * Internally composes `MultipleAuthProviders` from this package.
 * Use this component to present a standard, pre-styled authentication modal to your users.
 * For full-page authentication, consider using `LoginTemplate` from `@donotdev/templates`.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
function LoginModalComponent({ open, onOpenChange }: LoginModalProps) {
  const { t } = useTranslation('auth');

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('signIn', 'Sign In')}
      description={t('choosePlatform', 'Choose a platform to sign in with')}
    >
      <MultipleAuthProviders
        layout="vertical"
        showLabels={true}
        method="popup"
      />
    </Dialog>
  );
}

// Export the wrapped component that automatically handles auth fallback
// Set display name for debugging on the inner component

const LoginModal = withAuthFallback(LoginModalComponent, {
  message: 'Authentication is not configured',
  showLoginButton: true,
});

// Export as default
export default LoginModal;

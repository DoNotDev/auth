'use client';
// packages/features/auth/src/components/EmailVerification.tsx

/**
 * @fileoverview Email verification component for DoNotDev framework
 * @description Handles email verification UI and interactions
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useId } from 'react';
import type { JSX } from 'react';

import {
  Card,
  Button,
  BUTTON_VARIANT,
  Alert,
  Spinner,
  Stack,
  Text,
} from '@donotdev/components';
import { useTranslation, handleError } from '@donotdev/core';

import type { EmailVerificationProps } from '../constants';
import { useAuth } from '../useAuth';

/**
 * Component for handling email verification
 * Shows different states depending on verification status and provides verification button
 * Uses @donotdev/ui components for styling.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * @example
 * <EmailVerification verifyButtonText="Send Verification Link" />
 */
function EmailVerification({
  verifyButtonText,
  successMessage,
  sendingMessage,
  alreadyVerifiedMessage,
  notSignedInMessage,
  errorMessage,
  id,
}: EmailVerificationProps): JSX.Element | null {
  const { t } = useTranslation('auth');
  // Get user state (reactive), emailVerification state (reactive), and sendEmailVerification method (stable)
  const user = useAuth('user');
  const emailVerification = useAuth('emailVerification');
  const sendEmailVerification = useAuth('sendEmailVerification');

  // Extract userId from user
  const userId = user?.id;
  const reactId = useId();
  const componentId = id || `email-verification-${reactId}`;
  const headingId = `${componentId}-heading`;
  const buttonId = `${componentId}-button`;

  const handleSendVerification = async () => {
    if (!user || !userId) {
      return;
    }

    try {
      await sendEmailVerification();
    } catch (error) {
      // Error is handled by the store
      handleError(error);
    }
  };

  // Don't render if no user is signed in
  if (!user || !userId) {
    return null;
  }

  // Determine alert variant based on status
  const getAlertVariant = () => {
    if (emailVerification.status === 'pending') return undefined;
    if (emailVerification.status === 'error') return 'error';
    return undefined;
  };

  // Render appropriate UI based on verification status
  return (
    <Card
      id={componentId}
      title={<span id={headingId}>{t('emailVerification.title')}</span>}
    >
      <Stack>
        <Stack direction="row" justify="between" align="center">
          <Text level="small" variant="muted">
            {t('emailVerification.status.unknown')}
          </Text>

          <Button
            id={buttonId}
            onClick={handleSendVerification}
            disabled={emailVerification.status === 'pending'}
            aria-busy={emailVerification.status === 'pending'}
            variant={BUTTON_VARIANT.PRIMARY}
            icon={
              emailVerification.status === 'pending' ? (
                <Spinner aria-label="Loading" />
              ) : undefined
            }
            iconEnd={false}
          >
            {emailVerification.status === 'pending'
              ? t('status.verifying')
              : t('buttons.verify', 'Verify')}
          </Button>
        </Stack>

        {emailVerification.status !== 'verified' && (
          <Alert
            variant={getAlertVariant()}
            title={
              emailVerification.status === 'error'
                ? t('aria.errorAlert')
                : t('status.verifying')
            }
            description={
              emailVerification.status === 'error'
                ? ('error' in emailVerification
                    ? emailVerification.error
                    : undefined) ||
                  t('emailVerification.error', 'An error occurred')
                : t(
                    'emailVerification.sending',
                    'Sending verification email...'
                  )
            }
          />
        )}
      </Stack>
    </Card>
  );
}

// Set display name for debugging

// Export as default
export default EmailVerification;

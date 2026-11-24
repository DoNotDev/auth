'use client';
// packages/features/auth/src/components/EmailLinkForm.tsx

/**
 * @fileoverview EmailLinkForm component
 * @description Magic link authentication component
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Mail, CheckCircle } from 'lucide-react';

import {
  Button,
  BUTTON_VARIANT,
  Input,
  Alert,
  ALERT_VARIANT,
  Spinner,
  Stack,
  Text,
} from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

import { AuthCaptcha } from '../emailAuth/captcha';
import { useEmailLinkForm } from '../hooks/useEmailLinkForm';

export interface EmailLinkFormProps {
  className?: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  actionCodeSettings?: {
    url: string;
    handleCodeInApp: boolean;
  };
}

/**
 * EmailLinkForm - Magic link authentication component
 *
 * Handles the complete email link flow:
 * 1. User enters email
 * 2. Sends magic link via Firebase
 * 3. Shows "check your email" message
 * 4. Detects when user returns from email
 * 5. Completes sign-in automatically
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function EmailLinkForm({
  className = '',
  onSuccess,
  onError,
  actionCodeSettings,
}: EmailLinkFormProps) {
  const { t } = useTranslation('auth');

  const {
    email,
    setEmail,
    isLoading,
    isSent,
    error,
    handleSendLink,
    handleResend,
    canSubmit,
  } = useEmailLinkForm({
    onSuccess,
    onError,
    actionCodeSettings,
  });

  // Show success state after link is sent
  if (isSent) {
    return (
      <Stack className={className}>
        <Stack align="center">
          <CheckCircle className="dndev-size-touch" />
          <Text as="h3" level="h3">
            {t('checkEmail')}
          </Text>
          <Text level="small" variant="muted" className="dndev-text-center">
            {t('emailLink.sentMessage', { email })}
          </Text>
        </Stack>

        <Stack direction="row" justify="center">
          <Button
            variant={BUTTON_VARIANT.OUTLINE}
            onClick={handleResend}
            icon={Mail}
            iconEnd={false}
          >
            {t('emailLink.resend')}
          </Button>
        </Stack>
      </Stack>
    );
  }

  // Show form to enter email
  return (
    <form onSubmit={handleSendLink} className={className}>
      <Stack>
        <Input
          type="email"
          label={t('emailLink.emailLabel')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('emailPlaceholder')}
          required
          disabled={isLoading}
          className="dndev-w-full"
        />

        {error && <Alert variant={ALERT_VARIANT.ERROR} description={error} />}

        <AuthCaptcha />
        <Button
          type="submit"
          disabled={!canSubmit}
          icon={isLoading ? <Spinner aria-label="Loading" /> : Mail}
          iconEnd={false}
          className="dndev-w-full"
        >
          {isLoading ? t('emailLink.sending') : t('emailLink.sendLink')}
        </Button>

        <Text level="small" variant="muted" className="dndev-text-center">
          {t('emailLink.helpText')}
        </Text>
      </Stack>
    </form>
  );
}

export default EmailLinkForm;

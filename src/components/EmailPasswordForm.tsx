'use client';
// packages/features/auth/src/components/EmailPasswordForm.tsx

/**
 * @fileoverview EmailPasswordForm component
 * @description The framework's email/password form: sign in, sign up and forgot
 * password, composed from the exported pieces (`AuthForm`, fields, flows). An app that
 * needs another arrangement composes the same pieces and keeps every capability.
 *
 * @version 0.3.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useState } from 'react';
import type { MouseEvent } from 'react';

import { Button, BUTTON_VARIANT, Stack, Text } from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

import {
  AuthCodeStep,
  AuthConfirmPasswordField,
  AuthConsentField,
  AuthEmailField,
  AuthForm,
  AuthFormAlerts,
  AuthPasswordField,
  AuthRememberMeField,
  AuthSubmitButton,
} from '../emailAuth/fields';
import {
  AUTH_FIELD,
  useEmailSignIn,
  useEmailSignUp,
  usePasswordResetRequest,
} from '../emailAuth/flows';
import type { EmailAuthMode } from '../emailAuth/flows';
import type { EmailPasswordFormProps } from '../constants';

/** Email typed in the form a button belongs to (carried over when switching view). */
const typedEmail = (event: MouseEvent<HTMLButtonElement>): string => {
  const field = event.currentTarget.form?.elements.namedItem(AUTH_FIELD.EMAIL);
  return field instanceof HTMLInputElement ? field.value : '';
};

/**
 * Email/password form with three views: sign in (remember me, forgot password),
 * sign up (password policy + strength, breached-password check, confirmation,
 * consent) and forgot password. Success calls `onSuccess` at once; what the user must
 * still do arrives as a toast that stays until dismissed. With `confirmation="code"`,
 * a sign-up (or a sign-in of an unconfirmed address) shows the code step instead, and
 * `onSuccess` runs once the code signed the user in.
 *
 * @component
 * @example
 * ```tsx
 * <EmailPasswordForm onSuccess={() => setOpen(false)} />
 * ```
 */
function EmailPasswordForm({
  mode = 'signin',
  onSuccess,
  onError,
  className,
  tos,
  privacy,
  confirmation = 'toast',
}: EmailPasswordFormProps) {
  const { t } = useTranslation('auth');
  const [view, setView] = useState<EmailAuthMode>(mode);
  const [email, setEmail] = useState('');
  // Code mode: the address awaiting its code (the form shows the code step)
  const [codeEmail, setCodeEmail] = useState<string | null>(null);
  const options = {
    onSuccess: () => onSuccess?.(undefined),
    onError,
  };
  const signIn = useEmailSignIn({ ...options, confirmation, onCodeSent: setCodeEmail });
  const signUp = useEmailSignUp({
    ...options,
    confirmation,
    onSuccess: (outcome) => {
      if (confirmation === 'code' && outcome.awaitingConfirmation) {
        setCodeEmail(outcome.email);
      } else onSuccess?.(undefined);
    },
  });
  const reset = usePasswordResetRequest(options);

  if (codeEmail !== null) {
    return (
      <Stack className={className}>
        <AuthCodeStep
          email={codeEmail}
          onSuccess={() => onSuccess?.(undefined)}
          onChangeEmail={() => {
            setEmail(codeEmail);
            setCodeEmail(null);
          }}
        />
      </Stack>
    );
  }

  const switchTo =
    (next: EmailAuthMode) => (event: MouseEvent<HTMLButtonElement>) => {
      setEmail(typedEmail(event));
      setView(next);
    };

  const link = (label: string, next: EmailAuthMode) => (
    <Button
      type="button"
      variant={BUTTON_VARIANT.LINK}
      onClick={switchTo(next)}
    >
      {label}
    </Button>
  );

  if (view === 'reset') {
    return (
      <AuthForm key="reset" flow={reset} className={className}>
        <Text variant="muted">{t('forgotPassword.intro')}</Text>
        <AuthEmailField defaultValue={email} />
        <AuthFormAlerts />
        <AuthSubmitButton />
        <Stack align="center">{link(t('back'), 'signin')}</Stack>
      </AuthForm>
    );
  }

  if (view === 'signup') {
    return (
      <AuthForm key="signup" flow={signUp} className={className}>
        <AuthEmailField defaultValue={email} />
        <AuthPasswordField />
        <AuthConfirmPasswordField />
        <AuthConsentField tos={tos} privacy={privacy} />
        <AuthFormAlerts />
        <AuthSubmitButton />
        <Stack align="center">{link(t('alreadyHaveAccount'), 'signin')}</Stack>
      </AuthForm>
    );
  }

  return (
    <AuthForm key="signin" flow={signIn} className={className}>
      <AuthEmailField defaultValue={email} />
      <AuthPasswordField />
      <AuthRememberMeField />
      <AuthFormAlerts />
      <AuthSubmitButton />
      <Stack direction="row" gap="tight" justify="center" align="center">
        {link(t('forgotPassword'), 'reset')}
        <Text as="span" variant="muted">
          |
        </Text>
        {link(t('actions.sign_up_submit'), 'signup')}
      </Stack>
    </AuthForm>
  );
}

export default EmailPasswordForm;

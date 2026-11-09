'use client';
// packages/features/auth/src/components/PasswordResetCallback.tsx

/**
 * @fileoverview Password Reset Overlay
 * @description Zero-config overlay that auto-detects password reset callbacks from URL hash
 * fragments (Supabase) or query params (Firebase) and renders a full-screen Dialog.
 *
 * Mount once in your app (layout/provider level). It watches:
 * 1. URL hash: #error_code=otp_expired (Supabase expired token)
 * 2. URL hash: #type=recovery (Supabase valid token → PASSWORD_RECOVERY event)
 * 3. Store: passwordResetPending (set by Supabase provider on PASSWORD_RECOVERY)
 * 4. URL query: ?oobCode=xxx&mode=resetPassword (Firebase)
 *
 * Renders nothing when inactive. Full-screen Dialog when triggered.
 *
 * @version 0.2.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useCallback, useEffect, useState } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';

import {
  Alert,
  ALERT_VARIANT,
  Button,
  BUTTON_VARIANT,
  Dialog,
  PasswordInput,
  Spinner,
  Stack,
  Text,
} from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

import { useAuthStore } from '../AuthStore';
import { useAuth } from '../useAuth';
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator';

type ResetState =
  | 'idle' // No reset in progress - render nothing
  | 'loading' // Verifying code / checking state
  | 'ready' // Show password form
  | 'success' // Password updated
  | 'expired' // Token expired
  | 'invalid'; // Token invalid or already used

interface FormData {
  password: string;
  confirmPassword: string;
}

// =============================================================================
// Hash / URL detection
// =============================================================================

interface DetectedReset {
  type: 'supabase_error' | 'supabase_recovery' | 'firebase' | null;
  errorCode?: string;
  errorDescription?: string;
  oobCode?: string;
}

function detectResetFromUrl(): DetectedReset {
  if (typeof window === 'undefined') return { type: null };

  const hash = window.location.hash.slice(1); // remove #
  if (hash) {
    const params = new URLSearchParams(hash);

    // Supabase error: #error=access_denied&error_code=otp_expired&error_description=...
    const errorCode = params.get('error_code');
    if (errorCode) {
      const result: DetectedReset = {
        type: 'supabase_error',
        errorCode,
        errorDescription:
          params.get('error_description')?.replace(/\+/g, ' ') || undefined,
      };
      // Clean hash
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search
      );
      return result;
    }

    // Supabase valid recovery: #access_token=xxx&type=recovery
    // (Supabase JS client auto-handles this and fires PASSWORD_RECOVERY event,
    //  which sets passwordResetPending in the store. We just detect it here as fallback.)
    if (params.get('type') === 'recovery') {
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search
      );
      return { type: 'supabase_recovery' };
    }
  }

  // Firebase: ?oobCode=xxx&mode=resetPassword
  const query = new URLSearchParams(window.location.search);
  const oobCode = query.get('oobCode');
  if (oobCode && query.get('mode') === 'resetPassword') {
    return { type: 'firebase', oobCode };
  }

  return { type: null };
}

// =============================================================================
// Breached password check (NIST 800-63B / HaveIBeenPwned k-anonymity)
// =============================================================================

async function checkBreachedPassword(password: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    const prefix = hashHex.slice(0, 5);
    const suffix = hashHex.slice(5);
    const response = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      { headers: { 'Add-Padding': 'true' }, credentials: 'omit' }
    );
    if (!response.ok) return false;
    const text = await response.text();
    return text.split('\n').some((line) => {
      const [hash] = line.split(':');
      return hash?.trim() === suffix;
    });
  } catch {
    return false;
  }
}

// =============================================================================
// Component
// =============================================================================

/**
 * PasswordResetCallback - Zero-config overlay
 *
 * Mount once at layout/provider level. Renders nothing until a password reset
 * callback is detected (URL hash, store state, or query params).
 * Then renders a full-screen Dialog with the appropriate UI.
 *
 * @component
 * @version 0.2.0
 */
export function PasswordResetCallback() {
  const { t } = useTranslation('auth');
  const passwordResetPending = useAuth('passwordResetPending');
  const verifyPasswordResetCode = useAuth('verifyPasswordResetCode');
  const confirmPasswordReset = useAuth('confirmPasswordReset');
  const updatePassword = useAuth('updatePassword');
  const signInWithEmail = useAuth('signInWithEmail');

  const [resetState, setResetState] = useState<ResetState>('idle');
  const [resetEmail, setResetEmail] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState<string | null>(null);
  const [isFirebaseFlow, setIsFirebaseFlow] = useState(false);
  const [errorDescription, setErrorDescription] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormData>({
    mode: 'onChange',
    defaultValues: { password: '', confirmPassword: '' },
  });

  const passwordValue = useWatch({ control, name: 'password' });

  // Detect on mount + when passwordResetPending changes
  useEffect(() => {
    // Already active, don't re-detect
    if (resetState !== 'idle') return;

    const detected = detectResetFromUrl();

    if (detected.type === 'supabase_error') {
      if (detected.errorCode === 'otp_expired') {
        setResetState('expired');
      } else {
        setErrorDescription(detected.errorDescription || null);
        setResetState('invalid');
      }
      return;
    }

    if (detected.type === 'firebase' && detected.oobCode) {
      setIsFirebaseFlow(true);
      setResetCode(detected.oobCode);
      setResetState('loading');
      verifyPasswordResetCode(detected.oobCode).then((email) => {
        if (email) {
          setResetEmail(email);
          setResetState('ready');
        } else {
          setResetState('expired');
        }
      });
      return;
    }

    // Supabase: PASSWORD_RECOVERY event already fired → store has passwordResetPending
    if (passwordResetPending) {
      setResetState('ready');
    }
  }, [passwordResetPending, resetState, verifyPasswordResetCode]);

  const handlePasswordReset = useCallback(
    async (data: FormData) => {
      try {
        if (isFirebaseFlow && resetCode) {
          await confirmPasswordReset(resetCode, data.password);
          if (resetEmail) {
            try {
              await signInWithEmail(resetEmail, data.password);
            } catch {
              // Sign-in failed - still show success
            }
          }
        } else {
          // Supabase: user authenticated via recovery token, just update password
          await updatePassword(data.password);
          useAuthStore.getState().setPasswordResetPending(false);
        }
        // Password updated. User is already authenticated (Supabase recovery session).
        // Just close the dialog - the existing redirect guard (useRedirectGuard)
        // handles navigation based on app config.
        setResetState('idle');
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('expired') || msg.includes('EXPIRED')) {
          setResetState('expired');
        } else {
          setError('root', {
            message: t(
              'resetPassword.error',
              'Failed to reset password. Please try again.'
            ),
          });
        }
      }
    },
    [
      isFirebaseFlow,
      resetCode,
      resetEmail,
      confirmPasswordReset,
      updatePassword,
      signInWithEmail,
      setError,
      t,
    ]
  );

  const handleDismiss = useCallback(() => {
    setResetState('idle');
    setResetEmail(null);
    setResetCode(null);
    setErrorDescription(null);
    useAuthStore.getState().setPasswordResetPending(false);
    // Clean URL
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // Render nothing when idle
  if (resetState === 'idle') return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) handleDismiss();
      }}
      style={{ maxWidth: 'min(28rem, 90vw)' }}
      title={
        resetState === 'success'
          ? t('resetPassword.success_title', 'Password updated')
          : resetState === 'expired' || resetState === 'invalid'
            ? t('resetPassword.expired_title', 'Link expired')
            : resetState === 'loading'
              ? t('resetPassword.verifying', 'Verifying...')
              : t('resetPassword.title', 'Set new password')
      }
      showClose
    >
      {/* Loading */}
      {resetState === 'loading' && (
        <Stack align="center" justify="center">
          <Spinner />
          <Text level="body" variant="muted">
            {t('resetPassword.verifying', 'Verifying reset link...')}
          </Text>
        </Stack>
      )}

      {/* Expired / Invalid */}
      {(resetState === 'expired' || resetState === 'invalid') && (
        <Stack>
          <Alert
            variant={ALERT_VARIANT.WARNING}
            description={
              resetState === 'expired'
                ? t(
                    'resetPassword.expired_description',
                    'This password reset link has expired. Please request a new one.'
                  )
                : errorDescription ||
                  t(
                    'resetPassword.invalid_description',
                    'This password reset link is invalid. Please request a new one.'
                  )
            }
          />
          <Button
            variant={BUTTON_VARIANT.PRIMARY}
            onClick={handleDismiss}
            fullWidth
          >
            {t('resetPassword.back_to_signin', 'Back to Sign In')}
          </Button>
        </Stack>
      )}

      {/* Success */}
      {resetState === 'success' && (
        <Stack>
          <Alert
            variant={ALERT_VARIANT.SUCCESS}
            description={t(
              'resetPassword.success_description',
              'Your password has been reset successfully. You are now signed in.'
            )}
          />
          <Button
            variant={BUTTON_VARIANT.PRIMARY}
            onClick={handleDismiss}
            fullWidth
          >
            {t('resetPassword.continue', 'Continue')}
          </Button>
        </Stack>
      )}

      {/* Ready - new password form */}
      {resetState === 'ready' && (
        <form onSubmit={handleSubmit(handlePasswordReset)} noValidate>
          <Stack>
            {resetEmail && (
              <Text level="small" variant="muted">
                {t(
                  'resetPassword.for_email',
                  `Enter a new password for ${resetEmail}`
                )}
              </Text>
            )}

            {errors.root && (
              <Alert
                variant={ALERT_VARIANT.ERROR}
                description={errors.root.message}
              />
            )}

            <Controller
              name="password"
              control={control}
              rules={{
                required: t('passwordRequired', 'Password is required'),
                minLength: {
                  value: 8,
                  message: t(
                    'passwordMinLength',
                    'Password must be at least 8 characters'
                  ),
                },
                validate: {
                  uppercase: (v) =>
                    !v ||
                    /[A-Z]/.test(v) ||
                    t('passwordRequirement.uppercase', 'One uppercase letter'),
                  lowercase: (v) =>
                    !v ||
                    /[a-z]/.test(v) ||
                    t('passwordRequirement.lowercase', 'One lowercase letter'),
                  number: (v) =>
                    !v ||
                    /[0-9]/.test(v) ||
                    t('passwordRequirement.number', 'One number'),
                  special: (v) =>
                    !v ||
                    /[^a-zA-Z0-9]/.test(v) ||
                    t('passwordRequirement.special', 'One special character'),
                  breached: async (v) => {
                    if (!v || v.length < 8) return true;
                    const isBreached = await checkBreachedPassword(v);
                    return (
                      !isBreached ||
                      t(
                        'errors.breached_password',
                        'This password has appeared in a data breach.'
                      )
                    );
                  },
                },
              }}
              render={({ field }) => (
                <Stack gap="tight">
                  <PasswordInput
                    {...field}
                    label={t('resetPassword.new_password', 'New password')}
                    placeholder={t(
                      'passwordPlaceholder',
                      'Enter your password'
                    )}
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    aria-invalid={!!errors.password}
                    aria-describedby={
                      errors.password ? 'reset-password-error' : undefined
                    }
                    className="dndev-w-full"
                    data-variant={errors.password ? 'destructive' : undefined}
                  />
                  {errors.password && (
                    <Text
                      as="span"
                      level="caption"
                      variant="destructive"
                      id="reset-password-error"
                      role="alert"
                    >
                      {errors.password.message}
                    </Text>
                  )}
                </Stack>
              )}
            />

            <Controller
              name="confirmPassword"
              control={control}
              rules={{
                required: t(
                  'confirmPasswordRequired',
                  'Please confirm your password'
                ),
                validate: (v) =>
                  v === getValues('password') ||
                  t('confirmPasswordMismatch', 'Passwords do not match'),
              }}
              render={({ field }) => (
                <Stack gap="tight">
                  <PasswordInput
                    {...field}
                    label={t('confirmPassword', 'Confirm password')}
                    placeholder={t(
                      'confirmPasswordPlaceholder',
                      'Re-enter your password'
                    )}
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    aria-invalid={!!errors.confirmPassword}
                    aria-describedby={
                      errors.confirmPassword ? 'reset-confirm-error' : undefined
                    }
                    className="dndev-w-full"
                    data-variant={
                      errors.confirmPassword ? 'destructive' : undefined
                    }
                  />
                  {errors.confirmPassword && (
                    <Text
                      as="span"
                      level="caption"
                      variant="destructive"
                      id="reset-confirm-error"
                      role="alert"
                    >
                      {errors.confirmPassword.message}
                    </Text>
                  )}
                </Stack>
              )}
            />

            {passwordValue && (
              <PasswordStrengthIndicator
                password={passwordValue}
                minLength={8}
                showRequirements
              />
            )}

            <Button
              type="submit"
              variant={BUTTON_VARIANT.PRIMARY}
              disabled={isSubmitting}
              fullWidth
            >
              {isSubmitting
                ? t('loading', 'Loading...')
                : t('resetPassword.submit', 'Reset Password')}
            </Button>
          </Stack>
        </form>
      )}
    </Dialog>
  );
}

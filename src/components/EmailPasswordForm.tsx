'use client';
// packages/features/auth/src/components/EmailPasswordForm.tsx

/**
 * @fileoverview EmailPasswordForm component
 * @description Form component for email/password authentication with real-time validation,
 * password strength indicator, and best practices. Uses framework components exclusively.
 *
 * Security: CAPTCHA-ready, anti-enumeration, client-side rate limiting, breached password check,
 * NIST 800-63B compliant password policy, autoComplete hints for password managers.
 *
 * @version 0.2.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';

import {
  Alert,
  ALERT_VARIANT,
  Button,
  BUTTON_VARIANT,
  Checkbox,
  Dialog,
  Input,
  Label,
  PasswordInput,
  Stack,
  Text,
  cn,
} from '@donotdev/components';
import { useTranslation, useAppConfig } from '@donotdev/core';

import { useAuth } from '../useAuth';
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator';
import type { EmailPasswordFormProps, FormMode } from '../constants';

interface FormData {
  email: string;
  password: string;
  confirmPassword?: string;
}

// =============================================================================
// Client-side rate limiting
// =============================================================================

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_ATTEMPTS_PER_WINDOW = 5;
const COOLDOWN_MS = 30_000;

function useSubmitRateLimit() {
  const attemptsRef = useRef<number[]>([]);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);

  const isRateLimited = useCallback(() => {
    if (cooldownUntil && Date.now() < cooldownUntil) return true;
    return false;
  }, [cooldownUntil]);

  const recordAttempt = useCallback(() => {
    const now = Date.now();
    // Prune old attempts outside window
    attemptsRef.current = attemptsRef.current.filter(
      (ts) => now - ts < RATE_LIMIT_WINDOW_MS
    );
    attemptsRef.current.push(now);

    if (attemptsRef.current.length >= MAX_ATTEMPTS_PER_WINDOW) {
      setCooldownUntil(now + COOLDOWN_MS);
      attemptsRef.current = [];
    }
  }, []);

  // Clear cooldown when timer expires
  useEffect(() => {
    if (!cooldownUntil) return;
    const remaining = cooldownUntil - Date.now();
    if (remaining <= 0) {
      setCooldownUntil(null);
      return;
    }
    const timer = setTimeout(() => setCooldownUntil(null), remaining);
    return () => clearTimeout(timer);
  }, [cooldownUntil]);

  return { isRateLimited, recordAttempt, cooldownUntil };
}

// =============================================================================
// Breached password check (HaveIBeenPwned k-anonymity API - NIST 800-63B)
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
      {
        headers: { 'Add-Padding': 'true' },
        credentials: 'omit',
      }
    );

    if (!response.ok) return false; // Fail open - don't block user if API is down

    const text = await response.text();
    return text.split('\n').some((line) => {
      const [hash] = line.split(':');
      return hash?.trim() === suffix;
    });
  } catch {
    return false; // Fail open
  }
}

// =============================================================================
// Error code mapping (Supabase + Firebase specific)
// =============================================================================

const ERROR_MAP: Array<{
  test: (msg: string) => boolean;
  key: string;
  fallback: string;
}> = [
  {
    test: (msg) =>
      msg.includes('429') ||
      msg.includes('rate') ||
      msg.includes('too_many_requests'),
    key: 'errors.rate_limit',
    fallback: 'Too many attempts. Please wait a moment and try again.',
  },
  {
    test: (msg) =>
      msg.includes('email_not_confirmed') ||
      msg.includes('email not confirmed') ||
      msg.includes('auth/unverified-email'),
    key: 'errors.email_not_confirmed',
    fallback: 'Please verify your email before signing in.',
  },
  {
    test: (msg) =>
      msg.includes('invalid_credentials') ||
      msg.includes('invalid login credentials') ||
      msg.includes('invalid-credential') ||
      msg.includes('auth/wrong-password') ||
      msg.includes('auth/user-not-found') ||
      (msg.includes('invalid') && msg.includes('credential')),
    key: 'errors.invalid_credentials',
    fallback: 'Invalid email or password.',
  },
  {
    test: (msg) =>
      msg.includes('already') ||
      msg.includes('exists') ||
      msg.includes('user_already_exists') ||
      msg.includes('user already registered') ||
      msg.includes('auth/email-already-in-use'),
    // Anti-enumeration: show generic "check email" instead of "already exists"
    key: 'signup.check_email',
    fallback: 'Check your email to confirm your account.',
  },
  {
    test: (msg) =>
      msg.includes('weak_password') ||
      msg.includes('weak password') ||
      msg.includes('auth/weak-password'),
    key: 'errors.weak_password',
    fallback: 'Password is too weak. Please choose a stronger password.',
  },
  {
    test: (msg) => msg.includes('network') || msg.includes('fetch'),
    key: 'networkError',
    fallback: 'Network error. Please check your connection and try again.',
  },
];

function mapErrorMessage(
  error: unknown,
  t: (key: string, fallback: string) => string
): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lower = errorMessage.toLowerCase();

  for (const mapping of ERROR_MAP) {
    if (mapping.test(lower)) {
      return t(mapping.key, mapping.fallback);
    }
  }

  return t('errorGeneric', 'Authentication failed. Please try again.');
}

// =============================================================================
// Component
// =============================================================================

/**
 * EmailPasswordForm Component
 *
 * Best-in-class email/password authentication form with:
 * - Real-time validation with react-hook-form
 * - Password strength indicator with inline requirements
 * - Breached password detection (NIST 800-63B / HaveIBeenPwned)
 * - Client-side rate limiting
 * - Anti-enumeration (signup + forgot password)
 * - CAPTCHA-ready (consumer passes token via prop)
 * - autoComplete hints for password managers
 * - Remember me persistence
 * - Forgot password flow
 * - Resend verification email
 * - Terms of Service / Privacy Policy consent (GDPR)
 * - Sign in / Sign up mode switching with form reset
 * - Full i18n support
 * - Accessible with proper ARIA
 *
 * @component
 * @version 0.2.0
 */
function EmailPasswordForm({
  mode = 'signin',
  onSuccess,
  onError,
  className = '',
  tos,
  privacy,
  captchaToken,
}: EmailPasswordFormProps) {
  const { t } = useTranslation('auth');
  const appConfig = useAppConfig('app');
  const signInWithEmail = useAuth('signInWithEmail');
  const createUserWithEmail = useAuth('createUserWithEmail');
  const sendPasswordResetEmail = useAuth('sendPasswordResetEmail');
  const sendEmailVerification = useAuth('sendEmailVerification');
  const setRememberMePersistence = useAuth('setRememberMe');
  const isAvailable = useAuth('isAvailable');
  const status = useAuth('status');
  const loading = useAuth('loading');
  // Unavailable means the provider failed; while it initialises the form shows,
  // submit disabled until ready (no "unavailable" flash on every page load).
  const authFailed = status === 'degraded' || status === 'error';

  const [currentMode, setCurrentMode] = useState<FormMode>(mode);
  const isSignUp = currentMode === 'signup';
  const [rememberMe, setRememberMe] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [signupEmailSent, setSignupEmailSent] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [tosDialogOpen, setTosDialogOpen] = useState(false);
  const [privacyDialogOpen, setPrivacyDialogOpen] = useState(false);

  // Smart defaults: auto-detect from app config, fall back to standard paths
  const resolvedTos =
    tos !== undefined
      ? tos
      : (appConfig?.footer?.legalLinks?.find((l) => l.path.includes('terms'))
          ?.path ?? '/legal/terms');
  const resolvedPrivacy =
    privacy !== undefined
      ? privacy
      : (appConfig?.footer?.legalLinks?.find((l) => l.path.includes('privacy'))
          ?.path ?? '/legal/privacy');

  // false = explicitly disabled
  const tosEnabled = resolvedTos !== false;
  const privacyEnabled = resolvedPrivacy !== false;
  const tosIsContent = tosEnabled && typeof resolvedTos !== 'string';
  const privacyIsContent =
    privacyEnabled && typeof resolvedPrivacy !== 'string';
  const tosPath =
    tosEnabled && typeof resolvedTos === 'string' ? resolvedTos : null;
  const privacyPath =
    privacyEnabled && typeof resolvedPrivacy === 'string'
      ? resolvedPrivacy
      : null;

  const { isRateLimited, recordAttempt, cooldownUntil } = useSubmitRateLimit();

  const {
    control,
    handleSubmit,
    getValues,
    reset,
    formState: { errors, isSubmitting },
    setError,
    clearErrors,
  } = useForm<FormData>({
    mode: 'onChange',
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  // Use useWatch instead of watch() for React 19 compatibility (CSR/SSR safe)
  const passwordValue = useWatch({ control, name: 'password' });
  const emailValue = useWatch({ control, name: 'email' });

  // Reset form state when switching modes
  const handleModeSwitch = useCallback(
    (newMode: FormMode) => {
      reset({ email: emailValue || '', password: '', confirmPassword: '' });
      clearErrors();
      setSignupEmailSent(false);
      setForgotPasswordSent(false);
      setTosAccepted(false);
      setCurrentMode(newMode);
    },
    [reset, clearErrors, emailValue]
  );

  const handleFormSubmit = async (data: FormData) => {
    if (isRateLimited()) {
      setError('root', {
        message: t(
          'errors.rate_limit',
          'Too many attempts. Please wait a moment and try again.'
        ),
      });
      return;
    }

    recordAttempt();

    try {
      if (currentMode === 'signin') {
        // Set persistence for "Remember Me" - delegated to auth provider
        if (rememberMe !== undefined) {
          await setRememberMePersistence(rememberMe);
        }
        await signInWithEmail(data.email, data.password);
        onSuccess?.(undefined);
      } else {
        await createUserWithEmail(
          data.email,
          data.password,
          tosAccepted
            ? {
                gdpr_consent_at: new Date().toISOString(),
              }
            : undefined
        );
        // Anti-enumeration: always show "check email" regardless of outcome
        setSignupEmailSent(true);
        onSuccess?.(undefined);
      }
    } catch (error) {
      const isSignUpAttempt = currentMode === 'signup';
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const lower = errorMessage.toLowerCase();

      // Anti-enumeration for signup: if email already exists, still show "check email"
      if (
        isSignUpAttempt &&
        (lower.includes('already') ||
          lower.includes('exists') ||
          lower.includes('user_already_exists') ||
          lower.includes('auth/email-already-in-use'))
      ) {
        setSignupEmailSent(true);
        return;
      }

      const userMessage = mapErrorMessage(error, t);
      setError('root', { message: userMessage });
      onError?.(error instanceof Error ? error : new Error(errorMessage));
    }
  };

  const handleForgotPassword = async () => {
    if (!emailValue || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      setError('email', {
        message: t('emailRequired', 'Email is required'),
      });
      return;
    }

    setForgotPasswordLoading(true);
    try {
      await sendPasswordResetEmail(emailValue);
    } catch {
      // Anti-enumeration: silently succeed even if email doesn't exist
    } finally {
      // Always show success to prevent email enumeration
      setForgotPasswordSent(true);
      setForgotPasswordLoading(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      await sendEmailVerification();
    } catch {
      // Silent - verification resend is best-effort
    }
  };

  if (authFailed) {
    return (
      <Stack className={className}>
        <Alert
          variant={ALERT_VARIANT.WARNING}
          title={t('unavailable.title', 'Authentication Unavailable')}
          description={t(
            'unavailable.description',
            'Sign-in is temporarily unavailable. Please try again later.'
          )}
        />
      </Stack>
    );
  }

  const isLoading = loading || isSubmitting || !isAvailable;
  const hasTosRequirement = isSignUp && (tosEnabled || privacyEnabled);
  const isCaptchaBlocking = captchaToken !== undefined && !captchaToken;
  const isSubmitDisabled =
    isLoading ||
    isRateLimited() ||
    isCaptchaBlocking ||
    (hasTosRequirement && !tosAccepted);

  // Cooldown display
  const cooldownSeconds = cooldownUntil
    ? Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))
    : 0;

  return (
    <form
      onSubmit={handleSubmit(handleFormSubmit)}
      className={cn('dndev-auth-form', className)}
      noValidate
    >
      <Stack>
        {/* Global form error */}
        {errors.root && (
          <Alert
            variant={ALERT_VARIANT.ERROR}
            description={errors.root.message}
          />
        )}

        {/* Rate limit cooldown */}
        {isRateLimited() && cooldownSeconds > 0 && (
          <Alert
            variant={ALERT_VARIANT.WARNING}
            description={t(
              'errors.rate_limit_cooldown',
              `Too many attempts. Please wait ${cooldownSeconds} seconds.`
            )}
          />
        )}

        {/* Signup email confirmation - anti-enumeration safe */}
        {signupEmailSent && (
          <Stack>
            <Alert
              variant={ALERT_VARIANT.SUCCESS}
              title={t('signup.success_title', 'Check your email')}
              description={t(
                'signup.check_email',
                'If an account was created, you will receive a confirmation email. Check your inbox and spam folder.'
              )}
            />
            <Stack direction="row" gap="tight" justify="center" align="center">
              <Button
                type="button"
                variant={BUTTON_VARIANT.GHOST}
                onClick={handleResendVerification}
              >
                {t('signup.resend_verification', 'Resend verification email')}
              </Button>
              <Text as="span" variant="muted">
                |
              </Text>
              <Button
                type="button"
                variant={BUTTON_VARIANT.LINK}
                onClick={() => handleModeSwitch('signin')}
              >
                {t('actions.sign_in_submit', 'Sign In')}
              </Button>
            </Stack>
          </Stack>
        )}

        {/* Forgot password success - anti-enumeration safe */}
        {forgotPasswordSent && (
          <Stack>
            <Alert
              variant={ALERT_VARIANT.SUCCESS}
              title={t('forgotPassword.sent', 'Password reset email sent')}
              description={t(
                'forgotPassword.check_email_safe',
                'If an account exists with this email, you will receive password reset instructions.'
              )}
            />
            <Stack align="center">
              <Button
                type="button"
                variant={BUTTON_VARIANT.LINK}
                onClick={() => {
                  setForgotPasswordSent(false);
                }}
              >
                {t('back', 'Back')}
              </Button>
            </Stack>
          </Stack>
        )}

        {/* Main form - hidden after signup success or forgot password sent */}
        {!signupEmailSent && !forgotPasswordSent && (
          <Stack>
            {/* Email field */}
            <Controller
              name="email"
              control={control}
              rules={{
                required: t('emailRequired', 'Email is required'),
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: t('emailInvalid', 'Invalid email address'),
                },
              }}
              render={({ field }) => (
                <Stack gap="tight">
                  <Input
                    {...field}
                    type="email"
                    label={t('email', 'Email')}
                    placeholder={t('emailPlaceholder', 'Enter your email')}
                    autoComplete="email webauthn"
                    disabled={isLoading || forgotPasswordLoading}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                    className="dndev-w-full"
                    data-variant={errors.email ? 'destructive' : undefined}
                  />
                  {errors.email && (
                    <Text
                      as="span"
                      level="caption"
                      variant="destructive"
                      id="email-error"
                      role="alert"
                    >
                      {errors.email.message}
                    </Text>
                  )}
                </Stack>
              )}
            />

            {/* Password field */}
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
                validate: isSignUp
                  ? {
                      uppercase: (value) => {
                        if (!value) return true;
                        if (!/[A-Z]/.test(value)) {
                          return t(
                            'passwordRequirement.uppercase',
                            'Password must contain at least one uppercase letter'
                          );
                        }
                        return true;
                      },
                      lowercase: (value) => {
                        if (!value) return true;
                        if (!/[a-z]/.test(value)) {
                          return t(
                            'passwordRequirement.lowercase',
                            'Password must contain at least one lowercase letter'
                          );
                        }
                        return true;
                      },
                      number: (value) => {
                        if (!value) return true;
                        if (!/[0-9]/.test(value)) {
                          return t(
                            'passwordRequirement.number',
                            'Password must contain at least one number'
                          );
                        }
                        return true;
                      },
                      special: (value) => {
                        if (!value) return true;
                        if (!/[^a-zA-Z0-9]/.test(value)) {
                          return t(
                            'passwordRequirement.special',
                            'Password must contain at least one special character'
                          );
                        }
                        return true;
                      },
                      breached: async (value) => {
                        if (!value || value.length < 8) return true;
                        const isBreached = await checkBreachedPassword(value);
                        if (isBreached) {
                          return t(
                            'errors.breached_password',
                            'This password has appeared in a data breach. Please choose a different password.'
                          );
                        }
                        return true;
                      },
                    }
                  : undefined,
              }}
              render={({ field }) => {
                const passwordId = `password-${field.name}`;
                return (
                  <Stack gap="tight">
                    <PasswordInput
                      {...field}
                      id={passwordId}
                      label={t('password', 'Password')}
                      placeholder={t(
                        'passwordPlaceholder',
                        'Enter your password'
                      )}
                      autoComplete={
                        isSignUp ? 'new-password' : 'current-password'
                      }
                      disabled={isLoading || forgotPasswordLoading}
                      aria-invalid={!!errors.password}
                      aria-describedby={
                        errors.password ? 'password-error' : undefined
                      }
                      className="dndev-w-full"
                      data-variant={errors.password ? 'destructive' : undefined}
                    />
                    {errors.password && (
                      <Text
                        as="span"
                        level="caption"
                        variant="destructive"
                        id="password-error"
                        role="alert"
                      >
                        {errors.password.message}
                      </Text>
                    )}
                  </Stack>
                );
              }}
            />

            {/* Confirm Password (signup only) */}
            {isSignUp && (
              <Controller
                name="confirmPassword"
                control={control}
                rules={{
                  required: t(
                    'confirmPasswordRequired',
                    'Please confirm your password'
                  ),
                  validate: (value) => {
                    // Use getValues instead of useWatch to avoid stale value on fast typing
                    const currentPassword = getValues('password');
                    if (value !== currentPassword) {
                      return t(
                        'confirmPasswordMismatch',
                        'Passwords do not match'
                      );
                    }
                    return true;
                  },
                }}
                render={({ field }) => (
                  <Stack gap="tight">
                    <PasswordInput
                      {...field}
                      label={t('confirmPassword', 'Confirm Password')}
                      placeholder={t(
                        'confirmPasswordPlaceholder',
                        'Re-enter your password'
                      )}
                      autoComplete="new-password"
                      disabled={isLoading}
                      aria-invalid={!!errors.confirmPassword}
                      aria-describedby={
                        errors.confirmPassword
                          ? 'confirm-password-error'
                          : undefined
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
                        id="confirm-password-error"
                        role="alert"
                      >
                        {errors.confirmPassword.message}
                      </Text>
                    )}
                  </Stack>
                )}
              />
            )}

            {/* Password Strength + Inline Requirements (signup only, visible during typing) */}
            {isSignUp && passwordValue && (
              <PasswordStrengthIndicator
                password={passwordValue}
                minLength={8}
                showRequirements
              />
            )}

            {/* Terms of Service / Privacy Policy (signup only - GDPR) */}
            {hasTosRequirement && (
              <>
                <Stack direction="row" gap="tight" align="start">
                  <Checkbox
                    id="tos-accept"
                    checked={tosAccepted}
                    onCheckedChange={(checked) =>
                      setTosAccepted(checked === true)
                    }
                    disabled={isLoading}
                  />
                  <Label htmlFor="tos-accept">
                    <Text as="span" level="caption">
                      {t('terms.accept_prefix', 'I accept the')}{' '}
                      {tosEnabled && (
                        <Button
                          type="button"
                          variant={BUTTON_VARIANT.LINK}
                          onClick={() => {
                            if (tosIsContent) {
                              setTosDialogOpen(true);
                            } else if (tosPath) {
                              window.open(
                                tosPath,
                                '_blank',
                                'noopener,noreferrer'
                              );
                            }
                          }}
                          className="dndev-p-0 dndev-h-auto"
                          style={{
                            minHeight: 'auto',
                            padding: 0,
                            display: 'inline',
                          }}
                        >
                          {t('terms.tos', 'Terms of Service')}
                        </Button>
                      )}
                      {tosEnabled && privacyEnabled && (
                        <> {t('terms.and', 'and')} </>
                      )}
                      {privacyEnabled && (
                        <Button
                          type="button"
                          variant={BUTTON_VARIANT.LINK}
                          onClick={() => {
                            if (privacyIsContent) {
                              setPrivacyDialogOpen(true);
                            } else if (privacyPath) {
                              window.open(
                                privacyPath,
                                '_blank',
                                'noopener,noreferrer'
                              );
                            }
                          }}
                          className="dndev-p-0 dndev-h-auto"
                          style={{
                            minHeight: 'auto',
                            padding: 0,
                            display: 'inline',
                          }}
                        >
                          {t('terms.privacy', 'Privacy Policy')}
                        </Button>
                      )}
                    </Text>
                  </Label>
                </Stack>

                {/* ToS Dialog (when ReactNode content provided) */}
                {tosIsContent && (
                  <Dialog
                    open={tosDialogOpen}
                    onOpenChange={setTosDialogOpen}
                    title={t('terms.tos', 'Terms of Service')}
                    showClose
                  >
                    {resolvedTos}
                  </Dialog>
                )}

                {/* Privacy Dialog (when ReactNode content provided) */}
                {privacyIsContent && (
                  <Dialog
                    open={privacyDialogOpen}
                    onOpenChange={setPrivacyDialogOpen}
                    title={t('terms.privacy', 'Privacy Policy')}
                    showClose
                  >
                    {resolvedPrivacy}
                  </Dialog>
                )}
              </>
            )}

            {/* Remember Me (signin only) */}
            {!isSignUp && (
              <Stack direction="row" gap="tight" align="center">
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                  disabled={isLoading || forgotPasswordLoading}
                />
                <Label htmlFor="remember-me">
                  {t('rememberMe', 'Remember me')}
                </Label>
              </Stack>
            )}

            {/* Submit button */}
            <Button
              type="submit"
              variant={BUTTON_VARIANT.PRIMARY}
              disabled={isSubmitDisabled}
              fullWidth
            >
              {isLoading
                ? t('loading', 'Loading...')
                : isSignUp
                  ? t('actions.sign_up_submit', 'Sign Up')
                  : t('actions.sign_in_submit', 'Sign In')}
            </Button>

            {/* Forgot Password | Sign Up row (signin only) */}
            {!isSignUp && (
              <Stack
                direction="row"
                gap="tight"
                justify="center"
                align="center"
              >
                <Button
                  type="button"
                  variant={BUTTON_VARIANT.LINK}
                  disabled={isLoading || forgotPasswordLoading}
                  onClick={handleForgotPassword}
                >
                  {forgotPasswordLoading
                    ? t('loading', 'Loading...')
                    : t('forgotPassword', 'Forgot password?')}
                </Button>
                <Text as="span" variant="muted">
                  |
                </Text>
                <Button
                  type="button"
                  variant={BUTTON_VARIANT.LINK}
                  disabled={isLoading}
                  onClick={() => handleModeSwitch('signup')}
                >
                  {t('actions.sign_up_submit', 'Sign Up')}
                </Button>
              </Stack>
            )}

            {/* Sign In link (signup mode) */}
            {isSignUp && (
              <Stack align="center">
                <Button
                  type="button"
                  variant={BUTTON_VARIANT.LINK}
                  disabled={isLoading}
                  onClick={() => handleModeSwitch('signin')}
                >
                  {t('alreadyHaveAccount', 'Already have an account? Sign In')}
                </Button>
              </Stack>
            )}
          </Stack>
        )}
      </Stack>
    </form>
  );
}

export default EmailPasswordForm;

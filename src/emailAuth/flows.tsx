'use client';
// packages/features/auth/src/emailAuth/flows.tsx

/**
 * @fileoverview Email auth flows
 * @description The behaviour of email/password sign-in, sign-up and password-reset
 * request, as hooks. The framework form and any app form built on them get the same
 * validation, error messages, anti-enumeration, client-side throttle, CAPTCHA gate,
 * remember me, breached-password check and confirmations.
 *
 * Inputs are uncontrolled: a flow reads the submitted form by field name (`email`,
 * `password`, `confirmPassword`, `rememberMe`, `consent`) at submit time. A field that
 * is not rendered is not asked for: render `AuthConfirmPasswordField` to require the
 * confirmation, `AuthConsentField` to require consent, `AuthRememberMeField` to offer
 * remember me.
 *
 * Success never holds a dialog open: `onSuccess` runs at once (close the container
 * there) and what the user must still do (confirm the address, open the reset email)
 * comes as a toast that stays until dismissed, with a Resend action for sign-up.
 *
 * @version 0.1.0
 * @since 0.2.3
 * @author AMBROISE PARK Consulting
 */

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { Button, ToastAction, toast } from '@donotdev/components';
import type { SignUpMetadata } from '@donotdev/core';
import { useTranslation } from '@donotdev/core';

import { useAuth } from '../useAuth';
import {
  DEFAULT_PASSWORD_MIN_LENGTH,
  authErrorMessage,
  isAlreadyRegisteredError,
  isBreachedPassword,
  isEmail,
  isRateLimitError,
  isUnconfirmedError,
  newPasswordError,
} from './rules';
import type { AuthT } from './rules';

/** Field names the flows read from the submitted form. */
export const AUTH_FIELD = {
  EMAIL: 'email',
  PASSWORD: 'password',
  CONFIRM_PASSWORD: 'confirmPassword',
  REMEMBER_ME: 'rememberMe',
  CONSENT: 'consent',
} as const;

/** Which flow a form runs. */
export type EmailAuthMode = 'signin' | 'signup' | 'reset';

/** Per-field validation messages, keyed by field name. */
export interface AuthFieldErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
  consent?: string;
}

/** Options shared by every flow. */
export interface EmailAuthFlowOptions {
  /** Called once the flow succeeded: close the dialog / sheet here */
  onSuccess?: () => void;
  /** Called with the provider error after a failed attempt */
  onError?: (error: Error) => void;
  /**
   * CAPTCHA token. `undefined` = no CAPTCHA; while it is `null` / empty the submit is
   * blocked. The app renders the widget.
   */
  captchaToken?: string | null;
}

/** Outcome of a successful sign-up. */
export interface EmailSignUpOutcome {
  /**
   * The address must be confirmed before the user can sign in (no session yet). The
   * flow already showed the "check your email" toast with Resend.
   */
  awaitingConfirmation: boolean;
}

/** Options of {@link useEmailSignUp}. */
export interface EmailSignUpOptions extends Omit<
  EmailAuthFlowOptions,
  'onSuccess'
> {
  /** Called once sign-up succeeded: close the dialog / sheet here */
  onSuccess?: (outcome: EmailSignUpOutcome) => void;
  /** Minimum length of the new password (default 8) */
  passwordMinLength?: number;
  /** Extra sign-up metadata stored with the user (consent metadata is added for you) */
  metadata?: SignUpMetadata;
  /** The app's wording of the "check your email" toast (default: framework text) */
  checkEmailMessage?: { title: string; description?: string };
}

/** What a form needs from a flow: pass it to `AuthForm`. */
export interface EmailAuthFlow {
  /** The flow this is */
  mode: EmailAuthMode;
  /** Form submit handler */
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** A submit is in progress */
  busy: boolean;
  /** The provider is ready (submit disabled until then) */
  ready: boolean;
  /** The provider failed to start: show an "unavailable" notice instead of the form */
  unavailable: boolean;
  /** Submit is blocked (CAPTCHA token missing, throttled) */
  blocked: boolean;
  /** Form-level error (provider error, throttle) */
  error: string | null;
  /** Per-field validation errors */
  fieldErrors: AuthFieldErrors;
  /** Address whose sign-in failed because it was never confirmed (offer a resend) */
  unconfirmedEmail: string | null;
  /** Resend the confirmation email to `email` and confirm with a toast */
  resendVerification: (email: string) => Promise<void>;
  /** Minimum new-password length (sign-up) */
  passwordMinLength: number;
}

// =============================================================================
// Client-side throttle (the provider enforces the real limits)
// =============================================================================

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_ATTEMPTS_PER_WINDOW = 5;
const COOLDOWN_MS = 30_000;

function useThrottle() {
  const attempts = useRef<number[]>([]);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);

  useEffect(() => {
    if (cooldownUntil === null) return;
    const timer = setTimeout(
      () => setCooldownUntil(null),
      Math.max(0, cooldownUntil - Date.now())
    );
    return () => clearTimeout(timer);
  }, [cooldownUntil]);

  /** Seconds left of the cooldown, or 0 when an attempt may go (and is recorded). */
  const attempt = (): number => {
    const now = Date.now();
    if (cooldownUntil !== null && now < cooldownUntil) {
      return Math.ceil((cooldownUntil - now) / 1000);
    }
    attempts.current = attempts.current.filter(
      (ts) => now - ts < RATE_LIMIT_WINDOW_MS
    );
    attempts.current.push(now);
    if (attempts.current.length >= MAX_ATTEMPTS_PER_WINDOW) {
      attempts.current = [];
      setCooldownUntil(now + COOLDOWN_MS);
    }
    return 0;
  };

  return { attempt, throttled: cooldownUntil !== null };
}

// =============================================================================
// Shared flow state
// =============================================================================

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const textOf = (data: FormData, name: string): string => {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
};

/** The checkbox `name` when the form renders it, else `undefined`. */
const checkboxOf = (
  form: HTMLFormElement,
  name: string
): HTMLInputElement | undefined => {
  const element = form.elements.namedItem(name);
  return element instanceof HTMLInputElement ? element : undefined;
};

function useAuthT(): AuthT {
  const { t } = useTranslation('auth');
  return (key, fallback, values) =>
    t(key, { defaultValue: fallback, ...values });
}

function useFlowCore(
  mode: EmailAuthMode,
  options: Omit<EmailAuthFlowOptions, 'onSuccess'>
) {
  const t = useAuthT();
  const isAvailable = useAuth('isAvailable');
  const status = useAuth('status');
  const sendEmailVerification = useAuth('sendEmailVerification');
  const throttle = useThrottle();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(
    null
  );

  const captchaMissing =
    options.captchaToken !== undefined && !options.captchaToken;

  const resendVerification = async (email: string): Promise<void> => {
    try {
      await sendEmailVerification(email);
      toast('success', t('verificationSent', 'Verification email sent.'));
    } catch (e) {
      toast('error', authErrorMessage(e, t));
    }
  };

  /**
   * Runs one submit: field validation, throttle, then `run`. Returns nothing; state
   * carries the outcome.
   */
  const submit = async (
    event: FormEvent<HTMLFormElement>,
    validate: (form: HTMLFormElement, data: FormData) => AuthFieldErrors,
    run: (form: HTMLFormElement, data: FormData) => Promise<void>
  ): Promise<void> => {
    event.preventDefault();
    if (busy || captchaMissing || !isAvailable) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const errors = validate(form, data);
    setFieldErrors(errors);
    setUnconfirmedEmail(null);
    if (Object.keys(errors).length > 0) {
      setError(null);
      return;
    }
    const wait = throttle.attempt();
    if (wait > 0) {
      setError(
        t(
          'errors.rate_limit_cooldown',
          `Too many attempts. Please wait ${wait} seconds.`,
          { seconds: wait }
        )
      );
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await run(form, data);
    } catch (e) {
      if (mode === 'signin' && isUnconfirmedError(e)) {
        setUnconfirmedEmail(textOf(data, AUTH_FIELD.EMAIL).trim());
      }
      setError(authErrorMessage(e, t));
      options.onError?.(asError(e));
    } finally {
      setBusy(false);
    }
  };

  const flow = (
    onSubmit: EmailAuthFlow['onSubmit'],
    passwordMinLength: number
  ): EmailAuthFlow => ({
    mode,
    onSubmit,
    busy,
    ready: isAvailable,
    unavailable: status === 'degraded' || status === 'error',
    blocked: captchaMissing || throttle.throttled,
    error,
    fieldErrors,
    unconfirmedEmail,
    resendVerification,
    passwordMinLength,
  });

  return { t, submit, flow, resendVerification, setFieldErrors };
}

const validateEmail = (t: AuthT, email: string): string | undefined => {
  if (email === '') return t('emailRequired', 'Email is required');
  if (!isEmail(email)) return t('emailInvalid', 'Invalid email address');
  return undefined;
};

/** Drops the undefined entries, so "no errors" is an empty object. */
const definedErrors = (errors: AuthFieldErrors): AuthFieldErrors =>
  Object.fromEntries(
    Object.entries(errors).filter(([, message]) => message !== undefined)
  );

// =============================================================================
// Flows
// =============================================================================

/**
 * Email + password sign-in. Remember me is applied when the form renders
 * `AuthRememberMeField`; an unconfirmed address offers a resend.
 *
 * @param options - Callbacks and CAPTCHA token
 * @returns The flow, for `AuthForm`
 *
 * @example
 * ```tsx
 * const flow = useEmailSignIn({ onSuccess: close });
 * <AuthForm flow={flow}>
 *   <AuthEmailField />
 *   <AuthPasswordField />
 *   <AuthRememberMeField />
 *   <AuthFormAlerts />
 *   <AuthSubmitButton />
 * </AuthForm>
 * ```
 */
export function useEmailSignIn(
  options: EmailAuthFlowOptions = {}
): EmailAuthFlow {
  const core = useFlowCore('signin', options);
  const { t } = core;
  const signInWithEmail = useAuth('signInWithEmail');
  const setRememberMe = useAuth('setRememberMe');
  const canRememberMe = useAuth('canRememberMe');

  const onSubmit = (event: FormEvent<HTMLFormElement>) =>
    void core.submit(
      event,
      (_form, data) =>
        definedErrors({
          email: validateEmail(t, textOf(data, AUTH_FIELD.EMAIL).trim()),
          password:
            textOf(data, AUTH_FIELD.PASSWORD) === ''
              ? t('passwordRequired', 'Password is required')
              : undefined,
        }),
      async (form, data) => {
        const remember = checkboxOf(form, AUTH_FIELD.REMEMBER_ME);
        if (remember && canRememberMe()) await setRememberMe(remember.checked);
        const result = await signInWithEmail(
          textOf(data, AUTH_FIELD.EMAIL).trim(),
          textOf(data, AUTH_FIELD.PASSWORD)
        );
        if (!result?.success) throw new Error(result?.error ?? 'Sign in failed');
        options.onSuccess?.();
      }
    );

  return core.flow(onSubmit, DEFAULT_PASSWORD_MIN_LENGTH);
}

/**
 * Email + password sign-up. Password policy and breached-password check apply; the
 * confirmation field and consent are required when the form renders them.
 *
 * Anti-enumeration: an address that already has an account ends exactly like a new
 * one ("check your email"). When the provider asks for confirmation, `onSuccess` runs
 * and a toast that stays until dismissed tells the user to confirm, with Resend.
 *
 * @param options - Callbacks, CAPTCHA token, password minimum, extra metadata
 * @returns The flow, for `AuthForm`
 */
export function useEmailSignUp(options: EmailSignUpOptions = {}): EmailAuthFlow {
  const core = useFlowCore('signup', options);
  const { t } = core;
  const createUserWithEmail = useAuth('createUserWithEmail');
  const minLength = options.passwordMinLength ?? DEFAULT_PASSWORD_MIN_LENGTH;

  const confirmEmailToast = (email: string) => {
    toast({
      title:
        options.checkEmailMessage?.title ??
        t('signup.success_title', 'Check your email'),
      description:
        options.checkEmailMessage?.description ??
        t(
          'signup.check_email',
          'If an account was created, you will receive a confirmation email. Check your inbox and spam folder.'
        ),
      toastType: 'success',
      duration: 0,
      action: (
        <ToastAction asChild altText={t('resendEmail', 'Resend email')}>
          <Button onClick={() => void core.resendVerification(email)}>
            {t('resendEmail', 'Resend email')}
          </Button>
        </ToastAction>
      ),
    });
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) =>
    void core.submit(
      event,
      (form, data) => {
        const password = textOf(data, AUTH_FIELD.PASSWORD);
        const confirm = form.elements.namedItem(AUTH_FIELD.CONFIRM_PASSWORD);
        const consent = checkboxOf(form, AUTH_FIELD.CONSENT);
        return definedErrors({
          email: validateEmail(t, textOf(data, AUTH_FIELD.EMAIL).trim()),
          password: newPasswordError(password, minLength, t) ?? undefined,
          confirmPassword:
            confirm && textOf(data, AUTH_FIELD.CONFIRM_PASSWORD) !== password
              ? t('confirmPasswordMismatch', 'Passwords do not match')
              : undefined,
          consent:
            consent && !consent.checked
              ? t('terms.required', 'Please accept the terms to continue')
              : undefined,
        });
      },
      async (form, data) => {
        const email = textOf(data, AUTH_FIELD.EMAIL).trim();
        const password = textOf(data, AUTH_FIELD.PASSWORD);
        if (await isBreachedPassword(password)) {
          core.setFieldErrors({
            password: t(
              'errors.breached_password',
              'This password has appeared in a data breach. Please choose a different password.'
            ),
          });
          return;
        }
        const consent = checkboxOf(form, AUTH_FIELD.CONSENT);
        const metadata: SignUpMetadata | undefined =
          consent?.checked
            ? { ...options.metadata, gdpr_consent_at: new Date().toISOString() }
            : options.metadata;
        try {
          const result = await createUserWithEmail(email, password, metadata);
          if (!result?.success) {
            throw new Error(result?.error ?? 'Sign up failed');
          }
          // Signed in at once when the project does not require confirmation.
          const awaitingConfirmation = !result.user?.emailVerified;
          options.onSuccess?.({ awaitingConfirmation });
          if (awaitingConfirmation) confirmEmailToast(email);
        } catch (e) {
          if (!isAlreadyRegisteredError(e)) throw e;
          options.onSuccess?.({ awaitingConfirmation: true });
          confirmEmailToast(email);
        }
      }
    );

  return core.flow(onSubmit, minLength);
}

/**
 * Password-reset request. Anti-enumeration: the same outcome whether or not the address
 * has an account; `onSuccess` runs and a toast that stays until dismissed says to check
 * the inbox.
 *
 * @param options - Callbacks and CAPTCHA token
 * @returns The flow, for `AuthForm`
 */
export function usePasswordResetRequest(
  options: EmailAuthFlowOptions = {}
): EmailAuthFlow {
  const core = useFlowCore('reset', options);
  const { t } = core;
  const sendPasswordResetEmail = useAuth('sendPasswordResetEmail');

  const onSubmit = (event: FormEvent<HTMLFormElement>) =>
    void core.submit(
      event,
      (_form, data) =>
        definedErrors({
          email: validateEmail(t, textOf(data, AUTH_FIELD.EMAIL).trim()),
        }),
      async (_form, data) => {
        try {
          await sendPasswordResetEmail(textOf(data, AUTH_FIELD.EMAIL).trim());
        } catch (e) {
          // Throttling is the user's to know; "no such account" is not.
          if (isRateLimitError(e)) throw e;
        }
        options.onSuccess?.();
        toast({
          title: t('forgotPassword.sent', 'Password reset email sent'),
          description: t(
            'forgotPassword.check_email_safe',
            'If an account exists with this email, you will receive password reset instructions.'
          ),
          toastType: 'success',
          duration: 0,
        });
      }
    );

  return core.flow(onSubmit, DEFAULT_PASSWORD_MIN_LENGTH);
}

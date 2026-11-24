'use client';
// packages/features/auth/src/emailAuth/flows.tsx

/**
 * @fileoverview Email auth flows
 * @description The behaviour of email/password sign-in, sign-up, sign-up code
 * confirmation and password-reset request, as hooks. The framework form and any app
 * form built on them get the same validation, error messages, anti-enumeration,
 * client-side throttle, remember me, breached-password check and confirmations.
 * CAPTCHA is not a flow option: with the env var `TURNSTILE_SITE_KEY` set, the provider
 * takes a fresh Turnstile token for each gated call from the widget `AuthSubmitButton`
 * renders (`getCaptchaToken`, `@donotdev/core`); a CAPTCHA failure is the form error.
 *
 * Inputs are uncontrolled: a flow reads the submitted form by field name (`email`,
 * `password`, `confirmPassword`, `rememberMe`, `consent`, `displayName`) at submit
 * time. A field that is not rendered is not asked for: render `AuthConfirmPasswordField`
 * to require the confirmation, `AuthConsentField` to require consent,
 * `AuthRememberMeField` to offer remember me, `AuthNameField` to ask the name used in
 * emails (optional, stored with the sign-up when filled).
 *
 * Success never holds a dialog open: `onSuccess` runs at once (close the container
 * there) and what the user must still do (confirm the address, open the reset email)
 * comes as a toast that stays until dismissed, with a Resend action for sign-up.
 *
 * Sign-up with `confirmation: 'code'` shows no toast: `onSuccess` hands over the
 * address and the app shows the code step (`AuthCodeStep`, or
 * `useEmailCodeConfirmation` + `AuthCodeField`), where the user types the emailed code
 * and is signed in. Sign-in with `confirmation: 'code'`: an unconfirmed address gets a
 * fresh code and `onCodeSent` hands over the address for the same code step (also
 * when the resend is rate limited: the code already sent is still valid).
 *
 * The whole code-mode sign-up (account with app fields -> code -> app steps), steps
 * orchestrated by the framework: `EmailSignUpFlow` (signUpFlow.tsx).
 *
 * @version 0.1.0
 * @since 0.2.3
 * @author AMBROISE PARK Consulting
 */

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { Button, ToastAction, toast } from '@donotdev/components';
import type { AuthUser, SignUpMetadata } from '@donotdev/core';
import { useTranslation } from '@donotdev/core';

import { useAuth } from '../useAuth';
import {
  DEFAULT_CONFIRMATION_CODE_LENGTH,
  DEFAULT_PASSWORD_MIN_LENGTH,
  DEFAULT_RESEND_COOLDOWN_SECONDS,
  authErrorMessage,
  codeErrorMessage,
  isAlreadyRegisteredError,
  isBreachedPassword,
  isCaptchaError,
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
  DISPLAY_NAME: 'displayName',
} as const;

/**
 * Sign-up metadata key of the name (`AuthNameField`): the key the providers read as
 * the user's `displayName` (Supabase: `user_metadata.full_name`).
 */
const DISPLAY_NAME_METADATA_KEY = 'full_name';

/**
 * Sign-up: quiet time (ms) after the last keystroke before the breached-password
 * pre-check starts, so it never fires per keystroke.
 */
export const BREACH_PRECHECK_DEBOUNCE_MS = 600;

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
}

/** Options of {@link useEmailSignIn}. */
export interface EmailSignInOptions extends EmailAuthFlowOptions {
  /**
   * How a sign-in of an unconfirmed address ends (default `'toast'`).
   * - `'toast'`: the form error, with a "Resend verification email" action.
   * - `'code'`: the flow sends a fresh code (`sendEmailVerification`) and calls
   *   `onCodeSent`; the app shows the code step (`AuthCodeStep`). A rate-limited
   *   resend still calls `onCodeSent` (the code already sent stays valid); other
   *   resend errors are the form error.
   */
  confirmation?: EmailSignUpConfirmation;
  /** Code mode: a fresh code was sent to this unconfirmed address; show the code step */
  onCodeSent?: (email: string) => void;
}

/** Outcome of a successful sign-up. */
export interface EmailSignUpOutcome {
  /**
   * The address must be confirmed before the user can sign in (no session yet).
   * Toast mode: the flow already showed the "check your email" toast with Resend.
   * Code mode: show the code step for `email`.
   */
  awaitingConfirmation: boolean;
  /** The address that signed up (trimmed), e.g. for the code step */
  email: string;
}

/**
 * How a sign-up that needs confirmation ends.
 * - `'toast'`: a toast that stays until dismissed says to open the confirmation
 *   email, with Resend (the link in the email confirms).
 * - `'code'`: no toast; the app shows the code step (`useEmailCodeConfirmation`).
 *   Needs a provider that implements `verifyEmailCode` (Supabase) and an email
 *   template that sends the code.
 */
export type EmailSignUpConfirmation = 'toast' | 'code';

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
  /**
   * How a sign-up that needs confirmation ends (default `'toast'`, see
   * {@link EmailSignUpConfirmation}). Code mode, existing address: the provider sends
   * no confirmation code, so the flow sends a password-reset email instead
   * (fire-and-forget; the app words that template to cover "you already have an
   * account"). Its failure is logged, never shown, never changes the outcome.
   */
  confirmation?: EmailSignUpConfirmation;
  /**
   * Apply the character-class rules to the new password (uppercase, lowercase, digit,
   * special; default `true`). `false`: only the minimum length applies; the
   * breached-password check stays.
   */
  passwordComposition?: boolean;
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
  /** Submit is blocked (client-side throttle cooldown) */
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
  /**
   * The character-class rules apply to the new password (sign-up). Absent = `true`.
   * `AuthPasswordField` shows the requirements checklist only then.
   */
  passwordComposition?: boolean;
  /**
   * Sign-up only: tell the flow the new password changed. Once typing has stopped
   * ({@link BREACH_PRECHECK_DEBOUNCE_MS}) and the password meets the strength rules,
   * the flow runs the breached-password check in the background and shows the
   * breached error on the password field at once; submit reuses that result.
   * Absent in the other flows.
   */
  watchPassword?: (password: string) => void;
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

  const resendVerification = async (email: string): Promise<void> => {
    try {
      await sendEmailVerification(email);
      toast(
        'success',
        t(
          'verificationSent',
          "We've sent you a verification link to prove ownership of your account."
        )
      );
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
    if (busy || !isAvailable) return;
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
    passwordMinLength: number,
    passwordComposition?: boolean,
    watchPassword?: (password: string) => void
  ): EmailAuthFlow => ({
    mode,
    onSubmit,
    busy,
    ready: isAvailable,
    unavailable: status === 'degraded' || status === 'error',
    blocked: throttle.throttled,
    error,
    fieldErrors,
    unconfirmedEmail,
    resendVerification,
    passwordMinLength,
    ...(passwordComposition === undefined ? {} : { passwordComposition }),
    ...(watchPassword ? { watchPassword } : {}),
  });

  return { t, submit, flow, resendVerification, setFieldErrors };
}

/**
 * The email check of every flow: the translated "required" / "invalid" message, or
 * `undefined` when `email` (already trimmed) is valid.
 *
 * @param t - Translate function of the `auth` namespace
 * @param email - The trimmed address
 * @returns The error message, or `undefined`
 */
export const validateEmail = (t: AuthT, email: string): string | undefined => {
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
 * `AuthRememberMeField`. An unconfirmed address offers a resend, or with
 * `confirmation: 'code'` gets a fresh code and `onCodeSent(email)` (show `AuthCodeStep`).
 *
 * @param options - Callbacks, confirmation mode
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
  options: EmailSignInOptions = {}
): EmailAuthFlow {
  const core = useFlowCore('signin', options);
  const { t } = core;
  const signInWithEmail = useAuth('signInWithEmail');
  const sendEmailVerification = useAuth('sendEmailVerification');
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
        const email = textOf(data, AUTH_FIELD.EMAIL).trim();
        try {
          const result = await signInWithEmail(
            email,
            textOf(data, AUTH_FIELD.PASSWORD)
          );
          if (!result?.success) {
            throw new Error(result?.error ?? 'Sign in failed');
          }
        } catch (e) {
          if (options.confirmation !== 'code' || !isUnconfirmedError(e)) throw e;
          // Code mode: a fresh code, then the app shows the code step. Rate limited
          // (a code went out moments ago): that code is still valid, show the step.
          try {
            await sendEmailVerification(email);
          } catch (resendError) {
            if (!isRateLimitError(resendError)) throw resendError;
          }
          options.onCodeSent?.(email);
          return;
        }
        options.onSuccess?.();
      }
    );

  return core.flow(onSubmit, DEFAULT_PASSWORD_MIN_LENGTH);
}

/**
 * Email + password sign-up. Password policy (`passwordComposition: false` = length
 * only) and breached-password check apply; the confirmation field and consent are
 * required when the form renders them. `AuthNameField`, when rendered and filled, is
 * stored trimmed as the user's display name (metadata `full_name`); never required.
 *
 * Anti-enumeration: an address that already has an account ends exactly like a new
 * one (`awaitingConfirmation: true`). When the provider asks for confirmation,
 * `onSuccess` runs and then:
 * - `confirmation: 'toast'` (default): a toast that stays until dismissed tells the
 *   user to confirm, with Resend;
 * - `confirmation: 'code'`: nothing more; the app shows the code step for
 *   `outcome.email`. For an existing address the flow sends a password-reset
 *   email (`sendPasswordResetEmail`), fire-and-forget: a failure goes to
 *   `console.error`, never to the screen.
 * A project that does not require confirmation signs the user in at once:
 * `awaitingConfirmation: false`.
 *
 * @param options - Callbacks, password policy, extra metadata,
 *   confirmation mode
 * @returns The flow, for `AuthForm`
 *
 * @example
 * ```tsx
 * const [email, setEmail] = useState<string | null>(null);
 * const flow = useEmailSignUp({
 *   confirmation: 'code',
 *   onSuccess: (outcome) => {
 *     if (outcome.awaitingConfirmation) setEmail(outcome.email);
 *     else close();
 *   },
 * });
 * ```
 */
export function useEmailSignUp(options: EmailSignUpOptions = {}): EmailAuthFlow {
  const core = useFlowCore('signup', options);
  const { t } = core;
  const createUserWithEmail = useAuth('createUserWithEmail');
  const sendPasswordResetEmail = useAuth('sendPasswordResetEmail');
  const minLength = options.passwordMinLength ?? DEFAULT_PASSWORD_MIN_LENGTH;
  const confirmation = options.confirmation ?? 'toast';
  const composition = options.passwordComposition ?? true;

  // Code mode, existing address: the provider sent nothing, so the owner gets the
  // reset email. Fire-and-forget: the outcome and the screen never depend on it.
  const sendExistingAccountEmail = (email: string) => {
    void (async () => {
      try {
        await sendPasswordResetEmail(email);
      } catch (error) {
        console.error('[auth] existing-account reset email failed', error);
      }
    })();
  };

  // Breached-password pre-check. The result is cached against the exact password
  // checked (promise included, so a check still in flight is awaited, not repeated);
  // `watched` is the latest password reported by the field: an answer for any other
  // value is stale and ignored. Nothing here is logged.
  const breachCheck = useRef<{ password: string; breached: Promise<boolean> } | null>(
    null
  );
  const watched = useRef('');
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(debounce.current), []);

  const breachedMessage = t(
    'errors.breached_password',
    'This password has appeared in a data breach. Please choose a different password.'
  );

  const checkBreached = (password: string): Promise<boolean> => {
    if (breachCheck.current?.password === password) {
      return breachCheck.current.breached;
    }
    const breached = isBreachedPassword(password);
    breachCheck.current = { password, breached };
    return breached;
  };

  const watchPassword = (password: string) => {
    watched.current = password;
    clearTimeout(debounce.current);
    // The password changed: a breached error shown for the previous value is outdated.
    core.setFieldErrors((errors) => {
      if (errors.password !== breachedMessage) return errors;
      const { password: _outdated, ...rest } = errors;
      return rest;
    });
    if (newPasswordError(password, minLength, t, composition) !== null) return;
    debounce.current = setTimeout(() => {
      void checkBreached(password).then((breached) => {
        if (!breached || watched.current !== password) return;
        core.setFieldErrors((errors) => ({
          ...errors,
          password: breachedMessage,
        }));
      });
    }, BREACH_PRECHECK_DEBOUNCE_MS);
  };

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
        <ToastAction asChild altText={t('resendEmail', 'Resend Email')}>
          <Button onClick={() => void core.resendVerification(email)}>
            {t('resendEmail', 'Resend Email')}
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
          password:
            newPasswordError(password, minLength, t, composition) ?? undefined,
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
        clearTimeout(debounce.current);
        if (await checkBreached(password)) {
          core.setFieldErrors({ password: breachedMessage });
          return;
        }
        const consent = checkboxOf(form, AUTH_FIELD.CONSENT);
        const name = textOf(data, AUTH_FIELD.DISPLAY_NAME).trim();
        const metadata: SignUpMetadata | undefined =
          consent?.checked || name
            ? {
                ...options.metadata,
                ...(consent?.checked
                  ? { gdpr_consent_at: new Date().toISOString() }
                  : {}),
                ...(name ? { [DISPLAY_NAME_METADATA_KEY]: name } : {}),
              }
            : options.metadata;
        try {
          const result = await createUserWithEmail(email, password, metadata);
          if (!result?.success) {
            throw new Error(result?.error ?? 'Sign up failed');
          }
          // Signed in at once when the project does not require confirmation.
          const awaitingConfirmation = !result.user?.emailVerified;
          options.onSuccess?.({ awaitingConfirmation, email });
          if (awaitingConfirmation && confirmation === 'toast') {
            confirmEmailToast(email);
          }
        } catch (e) {
          if (!isAlreadyRegisteredError(e)) throw e;
          options.onSuccess?.({ awaitingConfirmation: true, email });
          if (confirmation === 'toast') confirmEmailToast(email);
          else sendExistingAccountEmail(email);
        }
      }
    );

  return core.flow(
    onSubmit,
    minLength,
    options.passwordComposition,
    watchPassword
  );
}

/** Options of {@link usePasswordResetRequest}. */
export interface PasswordResetRequestOptions extends EmailAuthFlowOptions {
  /**
   * Confirm with a toast that stays until dismissed (default `true`). `false`: no
   * toast; render the "check your inbox" message inline from `flow.sent`.
   * @default true
   */
  toast?: boolean;
}

/** The password-reset request flow: an {@link EmailAuthFlow} plus `sent`. */
export interface PasswordResetRequestFlow extends EmailAuthFlow {
  /** The request went through (any address): `true` until the next submit */
  sent: boolean;
}

/**
 * Password-reset request. Anti-enumeration: the same outcome whether or not the address
 * has an account; `sent` turns `true`, `onSuccess` runs and a toast that stays until
 * dismissed says to check the inbox (`toast: false`: no toast, the app shows the
 * message inline from `sent`). Throttling and a CAPTCHA failure are the form error
 * (the request did not go out); any other provider error is hidden.
 *
 * @param options - Callbacks, toast opt-out
 * @returns The flow, for `AuthForm`
 */
export function usePasswordResetRequest(
  options: PasswordResetRequestOptions = {}
): PasswordResetRequestFlow {
  const core = useFlowCore('reset', options);
  const { t } = core;
  const sendPasswordResetEmail = useAuth('sendPasswordResetEmail');
  const [sent, setSent] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    setSent(false);
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
          // Throttling and a refused CAPTCHA are the user's to know; "no such account" is not.
          if (isRateLimitError(e) || isCaptchaError(e)) throw e;
        }
        setSent(true);
        options.onSuccess?.();
        if (options.toast === false) return;
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
  };

  return { ...core.flow(onSubmit, DEFAULT_PASSWORD_MIN_LENGTH), sent };
}

// =============================================================================
// Sign-up code confirmation
// =============================================================================

/** Options of {@link useEmailCodeConfirmation}. */
export interface EmailCodeConfirmationOptions {
  /** The address that signed up (`EmailSignUpOutcome.email`) */
  email: string;
  /**
   * Characters of the emailed code: match the provider (Supabase:
   * `mailer_otp_length`).
   * @default 6
   */
  length?: number;
  /**
   * Seconds before the code can be sent again. The countdown starts at mount: the
   * sign-up just sent a code.
   * @default 60
   */
  resendCooldownSeconds?: number;
  /** Called with the signed-in user once the code is confirmed: close the sheet here */
  onSuccess?: (user: AuthUser) => void;
  /** Called with the provider error after a failed confirmation or resend */
  onError?: (error: Error) => void;
}

/** What the code step needs from {@link useEmailCodeConfirmation}: pass it to `AuthCodeField`. */
export interface EmailCodeConfirmation {
  /** The address the code was sent to */
  email: string;
  /** Characters of the code */
  length: number;
  /** The code typed so far */
  code: string;
  /** Update the typed code */
  setCode: (code: string) => void;
  /**
   * Confirm the code (`code` by default; pass the value when it is not in state yet,
   * e.g. from `onComplete`). A wrong or expired code clears the typed code.
   */
  submit: (code?: string) => Promise<void>;
  /** A confirmation is in progress */
  busy: boolean;
  /** Translated message of the last failure (wrong / expired code, throttle, failed resend...), or `null` */
  error: string | null;
  /**
   * Send a new code (no-op while `resendIn > 0`) and restart the countdown. No toast:
   * success sets `resent`, a failure sets `error`.
   */
  resend: () => Promise<void>;
  /** A new code was sent: `true` after a successful resend until the next submit or resend */
  resent: boolean;
  /** A resend is in progress */
  resending: boolean;
  /** Seconds left before `resend` is allowed (0 = allowed) */
  resendIn: number;
  /** The provider is ready (confirm and resend wait for it) */
  ready: boolean;
}

/**
 * The code step of a sign-up made with `useEmailSignUp({ confirmation: 'code' })`:
 * the user types the emailed code, `useAuth('verifyEmailCode')` confirms it and signs
 * the user in. Same client throttle as the email flows; wrong / expired code and rate
 * limits get translated messages. Resend sends a new code with
 * `useAuth('sendEmailVerification')` once the countdown is over. No toast: the
 * outcome is state (`error`, `resent`) that `AuthCodeField` renders inline.
 *
 * @param options - Address, code length, resend cooldown, callbacks
 * @returns The code step state, for `AuthCodeField`
 *
 * @example
 * ```tsx
 * const confirmation = useEmailCodeConfirmation({ email, length: 8, onSuccess: close });
 * <AuthCodeField confirmation={confirmation} />
 * ```
 */
export function useEmailCodeConfirmation(
  options: EmailCodeConfirmationOptions
): EmailCodeConfirmation {
  const t = useAuthT();
  const isAvailable = useAuth('isAvailable');
  const verifyEmailCode = useAuth('verifyEmailCode');
  const sendEmailVerification = useAuth('sendEmailVerification');
  const throttle = useThrottle();
  const length = options.length ?? DEFAULT_CONFIRMATION_CODE_LENGTH;
  const cooldown =
    options.resendCooldownSeconds ?? DEFAULT_RESEND_COOLDOWN_SECONDS;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(cooldown);
  const [resent, setResent] = useState(false);
  // Guards a double submit (auto-submit + Enter) before `busy` re-renders.
  const inFlight = useRef(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const submit = async (value?: string): Promise<void> => {
    const candidate = (value ?? code).trim();
    if (inFlight.current || !isAvailable) return;
    setResent(false);
    if (candidate.length !== length) {
      setError(
        t('codeConfirmation.incomplete', `Enter the ${length}-digit code.`, {
          length,
        })
      );
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
    inFlight.current = true;
    setError(null);
    setBusy(true);
    try {
      const user = await verifyEmailCode(options.email, candidate);
      options.onSuccess?.(user);
    } catch (e) {
      setError(codeErrorMessage(e, t));
      setCode('');
      options.onError?.(asError(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const resend = async (): Promise<void> => {
    if (resendIn > 0 || resending || !isAvailable) return;
    setResending(true);
    setResent(false);
    setError(null);
    try {
      await sendEmailVerification(options.email);
      setResendIn(cooldown);
      setResent(true);
    } catch (e) {
      setError(codeErrorMessage(e, t));
      options.onError?.(asError(e));
    } finally {
      setResending(false);
    }
  };

  return {
    email: options.email,
    length,
    code,
    setCode,
    submit,
    busy,
    error,
    resend,
    resending,
    resent,
    resendIn,
    ready: isAvailable,
  };
}

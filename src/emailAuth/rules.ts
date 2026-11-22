// packages/features/auth/src/emailAuth/rules.ts

/**
 * @fileoverview Email auth rules
 * @description The rules every email/password flow shares, framework form or app form:
 * provider error -> user message, email format, new-password policy, breached-password
 * check (HaveIBeenPwned k-anonymity, NIST 800-63B), confirmation-code errors.
 *
 * Provider errors are recognised by their structured code first (the error's `code`,
 * or the provider code `wrapAuthError` keeps in `details.originalCode`), then by
 * their message.
 *
 * @version 0.1.0
 * @since 0.2.3
 * @author AMBROISE PARK Consulting
 */

/** Translate function of the `auth` namespace (key, fallback, interpolation). */
export type AuthT = (
  key: string,
  fallback: string,
  values?: Record<string, unknown>
) => string;

/** Default minimum length of a new password. */
export const DEFAULT_PASSWORD_MIN_LENGTH = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Whether `email` looks like an address (the provider validates for real). */
export function isEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

const messageOf = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).toLowerCase();

/**
 * Structured codes an error carries: its own `code` (Supabase `AuthError.code`,
 * Firebase `auth/...`, DoNotDevError code) and `details.originalCode` (the provider
 * code `wrapAuthError` keeps when the mapping does not know it).
 */
function codesOf(error: unknown): string[] {
  if (typeof error !== 'object' || error === null) return [];
  const codes: string[] = [];
  if ('code' in error && typeof error.code === 'string') codes.push(error.code);
  if ('details' in error && typeof error.details === 'object' && error.details) {
    const original = (error.details as { originalCode?: unknown }).originalCode;
    if (typeof original === 'string') codes.push(original);
  }
  return codes;
}

const hasCode = (error: unknown, codes: ReadonlySet<string>): boolean =>
  codesOf(error).some((code) => codes.has(code));

/** Provider error: too many requests (provider-side rate limit). */
export function isRateLimitError(error: unknown): boolean {
  const msg = messageOf(error);
  return (
    msg.includes('429') ||
    msg.includes('rate') ||
    msg.includes('too_many_requests')
  );
}

/** Provider error: the address exists but was never confirmed. */
export function isUnconfirmedError(error: unknown): boolean {
  const msg = messageOf(error);
  return (
    msg.includes('email_not_confirmed') ||
    msg.includes('email not confirmed') ||
    msg.includes('auth/unverified-email')
  );
}

const ALREADY_REGISTERED_CODES: ReadonlySet<string> = new Set([
  'user_already_exists', // Supabase, confirmations off
  'email_exists', // Supabase
  'auth/email-already-in-use', // Firebase
  'already-exists', // DoNotDevError (mapped Firebase code)
]);

/**
 * Provider error: sign-up with an address that already has an account. Structured
 * code first, message as the fallback (Supabase with confirmations on reports it as
 * a fake user, which the provider turns into an "already exists" message).
 */
export function isAlreadyRegisteredError(error: unknown): boolean {
  if (hasCode(error, ALREADY_REGISTERED_CODES)) return true;
  const msg = messageOf(error);
  return (
    msg.includes('already') ||
    msg.includes('exists') ||
    msg.includes('user_already_exists') ||
    msg.includes('auth/email-already-in-use')
  );
}

const ERROR_MAP: Array<{
  test: (msg: string) => boolean;
  key: string;
  fallback: string;
}> = [
  {
    test: isRateLimitError,
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

/** User-facing message for a provider error (rate limit, credentials, network...). */
export function authErrorMessage(error: unknown, t: AuthT): string {
  const msg = messageOf(error);
  for (const mapping of ERROR_MAP) {
    if (mapping.test(msg)) return t(mapping.key, mapping.fallback);
  }
  return t('errorGeneric', 'Authentication failed. Please try again.');
}

// =============================================================================
// Confirmation codes (sign-up code typed by the user)
// =============================================================================

/** Default number of characters of an emailed confirmation code. */
export const DEFAULT_CONFIRMATION_CODE_LENGTH = 6;

/** Default seconds before a confirmation code can be sent again. */
export const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

const CODE_EXPIRED_CODES: ReadonlySet<string> = new Set([
  'auth/expired-action-code', // Firebase
]);

const INVALID_CODE_CODES: ReadonlySet<string> = new Set([
  // GoTrue answers a wrong AND an expired code with `otp_expired` ("Token has
  // expired or is invalid"): it cannot tell them apart, so it counts as invalid.
  'otp_expired',
  'auth/invalid-action-code', // Firebase
  'auth/invalid-verification-code', // Firebase
]);

const RATE_LIMIT_CODES: ReadonlySet<string> = new Set([
  'over_request_rate_limit', // Supabase
  'over_email_send_rate_limit', // Supabase (resend: "you can only request this after N seconds")
  'auth/too-many-requests', // Firebase
  'rate-limit-exceeded', // DoNotDevError
]);

/** Provider error: the confirmation code is known to have expired. */
export function isCodeExpiredError(error: unknown): boolean {
  if (hasCode(error, CODE_EXPIRED_CODES)) return true;
  if (hasCode(error, INVALID_CODE_CODES)) return false;
  const msg = messageOf(error);
  return msg.includes('expired') && !msg.includes('invalid');
}

/** Provider error: the confirmation code is wrong (or wrong or expired, see `otp_expired`). */
export function isInvalidCodeError(error: unknown): boolean {
  if (hasCode(error, INVALID_CODE_CODES)) return true;
  const msg = messageOf(error);
  return (
    msg.includes('expired or is invalid') ||
    (msg.includes('invalid') &&
      (msg.includes('code') || msg.includes('token') || msg.includes('otp')))
  );
}

/**
 * User-facing message for a failed code confirmation or code resend: expired code,
 * wrong code, rate limit (structured codes included), else `authErrorMessage`.
 */
export function codeErrorMessage(error: unknown, t: AuthT): string {
  if (isCodeExpiredError(error)) {
    return t('errors.code_expired', 'This code has expired. Request a new code.');
  }
  if (isInvalidCodeError(error)) {
    return t(
      'errors.invalid_code',
      'This code is incorrect or has expired. Check the email or request a new code.'
    );
  }
  if (hasCode(error, RATE_LIMIT_CODES)) {
    return t(
      'errors.rate_limit',
      'Too many attempts. Please wait a moment and try again.'
    );
  }
  return authErrorMessage(error, t);
}

/**
 * First rule a new password breaks, or `null`. Policy: minimum length (8 by default),
 * then, unless `composition` is `false`, one uppercase letter, one lowercase letter,
 * one digit, one special character.
 *
 * @param password - The new password
 * @param minLength - Minimum length
 * @param t - Translate function of the `auth` namespace
 * @param composition - Apply the character-class rules (default `true`); `false` keeps
 *   only the empty check and the minimum length (NIST 800-63B: length over composition)
 * @returns The message of the first broken rule, or `null`
 */
export function newPasswordError(
  password: string,
  minLength: number,
  t: AuthT,
  composition = true
): string | null {
  if (password === '') return t('passwordRequired', 'Password is required');
  if (password.length < minLength) {
    return t(
      'passwordMinLength',
      `Password must be at least ${minLength} characters`,
      { count: minLength }
    );
  }
  if (!composition) return null;
  if (!/[A-Z]/.test(password)) {
    return t(
      'passwordRequirement.uppercase',
      'Password must contain at least one uppercase letter'
    );
  }
  if (!/[a-z]/.test(password)) {
    return t(
      'passwordRequirement.lowercase',
      'Password must contain at least one lowercase letter'
    );
  }
  if (!/[0-9]/.test(password)) {
    return t(
      'passwordRequirement.number',
      'Password must contain at least one number'
    );
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return t(
      'passwordRequirement.special',
      'Password must contain at least one special character'
    );
  }
  return null;
}

/**
 * Whether the password appears in a known breach (HaveIBeenPwned range API: only the
 * first 5 hex chars of the SHA-1 leave the browser). Fails open: an unreachable API
 * never blocks a sign-up.
 */
export async function isBreachedPassword(password: string): Promise<boolean> {
  try {
    const hashBuffer = await crypto.subtle.digest(
      'SHA-1',
      new TextEncoder().encode(password)
    );
    const hashHex = Array.from(new Uint8Array(hashBuffer))
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
    return text.split('\n').some((line) => line.split(':')[0]?.trim() === suffix);
  } catch {
    return false;
  }
}

// packages/features/auth/src/emailAuth/__tests__/rules.test.ts

import { describe, expect, it } from 'vitest';

import { DoNotDevError } from '@donotdev/core';

import {
  DEFAULT_PASSWORD_MIN_LENGTH,
  codeErrorMessage,
  isAlreadyRegisteredError,
  isCodeExpiredError,
  isInvalidCodeError,
  newPasswordError,
} from '../rules';

const t = (key: string) => key;
const check = (password: string) =>
  newPasswordError(password, DEFAULT_PASSWORD_MIN_LENGTH, t);

describe('new password policy: 8 minimum, an uppercase, a lowercase, a number, a special character', () => {
  it('accepts a password meeting the five rules, 8 characters is enough', () => {
    expect(check('Abcdef1!')).toBeNull();
  });

  it('rejects each missing rule', () => {
    expect(check('Ab1!')).toBe('passwordMinLength');
    expect(check('password1!')).toBe('passwordError.uppercase');
    expect(check('PASSWORD1!')).toBe('passwordError.lowercase');
    expect(check('Password!')).toBe('passwordError.number');
    expect(check('Password1')).toBe('passwordError.special');
    expect(check('')).toBe('passwordRequired');
  });
});

describe('new password policy without composition (passwordComposition: false)', () => {
  const lengthOnly = (password: string) =>
    newPasswordError(password, DEFAULT_PASSWORD_MIN_LENGTH, t, false);

  it('keeps the empty check and the minimum length', () => {
    expect(lengthOnly('')).toBe('passwordRequired');
    expect(lengthOnly('abc')).toBe('passwordMinLength');
  });

  it('accepts any password of the minimum length', () => {
    expect(lengthOnly('password')).toBeNull();
    expect(lengthOnly('12345678')).toBeNull();
  });
});

describe('isAlreadyRegisteredError: structured code first, message as fallback', () => {
  it('recognises the provider code on the error', () => {
    const error = Object.assign(new Error('Conflict'), {
      code: 'user_already_exists',
    });
    expect(isAlreadyRegisteredError(error)).toBe(true);
  });

  it('recognises the provider code kept by wrapAuthError in details.originalCode', () => {
    const error = new DoNotDevError('Request failed', 'unknown', {
      details: { originalCode: 'user_already_exists' },
    });
    expect(isAlreadyRegisteredError(error)).toBe(true);
  });

  it('keeps the message match', () => {
    expect(
      isAlreadyRegisteredError(
        new Error('An account with this email already exists')
      )
    ).toBe(true);
    expect(isAlreadyRegisteredError(new Error('Network down'))).toBe(false);
  });
});

describe('confirmation-code errors', () => {
  const wrapped = (originalCode: string, message = 'failed') =>
    new DoNotDevError(message, 'unknown', { details: { originalCode } });

  it('maps a wrong or expired Supabase code (otp_expired) to invalid_code', () => {
    const error = wrapped('otp_expired', 'Token has expired or is invalid');
    expect(isInvalidCodeError(error)).toBe(true);
    expect(isCodeExpiredError(error)).toBe(false);
    expect(codeErrorMessage(error, t)).toBe('errors.invalid_code');
  });

  it('maps a known-expired code to code_expired', () => {
    const error = Object.assign(new Error('expired'), {
      code: 'auth/expired-action-code',
    });
    expect(codeErrorMessage(error, t)).toBe('errors.code_expired');
  });

  it('maps rate limits by code, even when the message does not say so', () => {
    const error = wrapped(
      'over_email_send_rate_limit',
      'For security purposes, you can only request this after 42 seconds.'
    );
    expect(codeErrorMessage(error, t)).toBe('errors.rate_limit');
  });

  it('falls back to the auth messages', () => {
    expect(codeErrorMessage(new Error('Failed to fetch'), t)).toBe(
      'networkError'
    );
  });
});

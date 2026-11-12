// packages/features/auth/src/emailAuth/__tests__/rules.test.ts

import { describe, expect, it } from 'vitest';

import { DEFAULT_PASSWORD_MIN_LENGTH, newPasswordError } from '../rules';

const t = (key: string) => key;
const check = (password: string) =>
  newPasswordError(password, DEFAULT_PASSWORD_MIN_LENGTH, t);

describe('new password policy: 8 minimum, an uppercase, a lowercase, a number, a special character', () => {
  it('accepts a password meeting the five rules, 8 characters is enough', () => {
    expect(check('Abcdef1!')).toBeNull();
  });

  it('rejects each missing rule', () => {
    expect(check('Ab1!')).toBe('passwordMinLength');
    expect(check('password1!')).toBe('passwordRequirement.uppercase');
    expect(check('PASSWORD1!')).toBe('passwordRequirement.lowercase');
    expect(check('Password!')).toBe('passwordRequirement.number');
    expect(check('Password1')).toBe('passwordRequirement.special');
    expect(check('')).toBe('passwordRequired');
  });
});

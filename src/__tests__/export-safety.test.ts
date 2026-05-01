/**
 * @fileoverview Export Safety Net — Auth Package (Post-Move)
 * @description Verifies that @donotdev/auth still exports auth constants after
 * FirebaseAuth was moved to @donotdev/firebase. Tests the constants module
 * directly to avoid pulling in the full component tree.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { describe, it, expect } from 'vitest';

import {
  getAuthMethod,
  PARTNER_STATE,
  EMAIL_VERIFICATION_STATUS,
} from '../constants';

describe('Export Safety Net — @donotdev/auth constants', () => {
  it('exports getAuthMethod', () => {
    expect(getAuthMethod).toBeDefined();
    expect(typeof getAuthMethod).toBe('function');
  });

  it('getAuthMethod returns explicit method when provided', () => {
    expect(getAuthMethod('popup')).toBe('popup');
    expect(getAuthMethod('redirect')).toBe('redirect');
  });

  it('exports PARTNER_STATE with all values', () => {
    expect(PARTNER_STATE).toBeDefined();
    expect(PARTNER_STATE.IDLE).toBe('idle');
    expect(PARTNER_STATE.LOADING).toBe('loading');
    expect(PARTNER_STATE.ERROR).toBe('error');
    expect(PARTNER_STATE.AUTHENTICATED).toBe('authenticated');
  });

  it('exports EMAIL_VERIFICATION_STATUS with all values', () => {
    expect(EMAIL_VERIFICATION_STATUS).toBeDefined();
    expect(EMAIL_VERIFICATION_STATUS.VERIFIED).toBe('verified');
    expect(EMAIL_VERIFICATION_STATUS.PENDING).toBe('pending');
    expect(EMAIL_VERIFICATION_STATUS.ERROR).toBe('error');
  });
});

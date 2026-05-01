/**
 * @fileoverview Expo API Safety Net — Auth Package
 * @description Verifies that all @donotdev/auth APIs consumed by @donotdev/expo exist.
 * If any test fails after a framework change, the expo package WILL break.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { describe, it, expect, vi } from 'vitest';

// vi.hoisted runs before vi.mock hoisting — avoids TDZ
const { createMockStore } = vi.hoisted(() => {
  const createMockStore = () => {
    const state: Record<string, any> = {};
    const store: any = (selector?: any) => (selector ? selector(state) : state);
    store.getState = () => state;
    store.setState = (partial: any) =>
      Object.assign(
        state,
        typeof partial === 'function' ? partial(state) : partial
      );
    store.subscribe = vi.fn(() => vi.fn());
    store.destroy = vi.fn();
    state.setStatus = vi.fn();
    state.setAuthService = vi.fn();
    state.getCustomClaims = vi.fn(() => ({}));
    state.getCustomClaim = vi.fn(() => null);
    state.getPartnerState = vi.fn(() => 'idle');
    state.setPartnerState = vi.fn();
    return store;
  };
  return { createMockStore };
});

vi.mock('@donotdev/core', () => ({
  DEGRADED_AUTH_API: new Proxy({}, { get: () => vi.fn() }),
  FEATURE_STATUS: {
    INITIALIZING: 'initializing',
    READY: 'ready',
    DEGRADED: 'degraded',
    ERROR: 'error',
  },
  FRAMEWORK_FEATURES: { AUTH: 'auth' },
  handleError: vi.fn(),
  isClient: () => false,
  isDev: () => false,
  useFeatureConsent: () => true,
  USER_ROLES: { GUEST: 'guest', USER: 'user', ADMIN: 'admin' },
  SUBSCRIPTION_TIERS: { FREE: 'free' },
  hasRoleAccess: () => false,
  hasTierAccess: () => false,
  AUTH_PARTNERS: {},
  useTranslation: () => ({ t: (k: string) => k }),
  redirectToExternalUrlWithErrorHandling: vi.fn(),
  createDoNotDevStore: vi.fn(() => createMockStore()),
  createSingleton: vi.fn((factory: any) => factory),
  getDndevConfig: () => ({}),
  getStorageManager: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  })),
  getGlobalSingleton: vi.fn((_key: string, factory: any) => factory()),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  OAuthProvider: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  updatePassword: vi.fn(),
  sendEmailVerification: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  EmailAuthProvider: { credential: vi.fn() },
  deleteUser: vi.fn(),
  linkWithPopup: vi.fn(),
  linkWithRedirect: vi.fn(),
  signOut: vi.fn(),
  isSignInWithEmailLink: vi.fn(),
  sendSignInLinkToEmail: vi.fn(),
  signInWithEmailLink: vi.fn(),
  signInWithCredential: vi.fn(),
  reauthenticateWithPopup: vi.fn(),
}));

vi.mock('firebase/app', () => ({
  getApps: () => [],
  initializeApp: vi.fn(),
  getApp: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
}));

vi.mock('@donotdev/firebase', () => ({
  getFirebaseSDK: vi.fn(() => ({
    auth: null,
    firestore: null,
    storage: null,
  })),
}));

import * as mod from '@donotdev/auth';

describe('Expo API Safety Net — @donotdev/auth', () => {
  it('exports useAuth hook', () => {
    expect(mod.useAuth).toBeDefined();
    expect(typeof mod.useAuth).toBe('function');
  });

  it('exports useDeleteAccount hook', () => {
    expect(mod.useDeleteAccount).toBeDefined();
    expect(typeof mod.useDeleteAccount).toBe('function');
  });

  it('exports getAuthState', () => {
    expect(mod.getAuthState).toBeDefined();
    expect(typeof mod.getAuthState).toBe('function');
  });

  it('exports subscribeToAuth', () => {
    expect(mod.subscribeToAuth).toBeDefined();
    expect(typeof mod.subscribeToAuth).toBe('function');
  });
});

// packages/features/auth/src/index.ts

/**
 * @fileoverview Auth package
 * @description Authentication package for DoNotDev framework. Provides authentication hooks, stores, components, and utilities for user authentication.
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

// Core Auth Hook
export { useAuth } from './useAuth';

// Account Deletion Hook
export { useDeleteAccount } from './hooks/useDeleteAccount';
export type { DeleteAccountState } from './hooks/useDeleteAccount';

// Non-React Helpers (for Zustand stores, etc.)
export { getAuthState, subscribeToAuth } from './authHelpers';

// Public "Lego Block" Components
export {
  AuthPartnerButton,
  ConfirmDeleteDialog,
  FeatureGuard,
  GoogleOneTap,
  LoginModal,
  MultipleAuthProviders, // Added for AuthHeader and future LoginTemplate
  PasswordResetCallback,
  ReauthDialog,
} from './components';

// Public Types - imported from core for consistency
export type {
  AuthError, // Explicitly import AuthError from core
  AuthUser as User, // Rename AuthUser to User for public API simplicity
  UserRole,
  SubscriptionTier,
} from '@donotdev/core';

// Auth constants and utilities
export {
  getAuthMethod,
  PARTNER_STATE,
  EMAIL_VERIFICATION_STATUS,
} from './constants';
export type { AuthMethod } from './constants';

// Component Prop Types
export type {
  AuthPartnerButtonProps,
  GoogleOneTapProps,
  LoginModalProps,
} from './constants';
export type { MultipleAuthProvidersProps } from './components/MultipleAuthProviders';
export type { FeatureGuardProps } from './components/FeatureGuard';
export type {
  ConfirmDeleteDialogProps,
  ReauthDialogProps,
} from './components/DeleteAccountDialogs';

// Note: Other internal components, stores (AuthStore), hooks (useDeleteAccount, useFedCM),
// and utilities are intentionally not re-exported to maintain a strict, minimal public API.
// Account deletion functionality is accessed via useAuth('deleteAccount').


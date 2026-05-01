// packages/features/auth/src/constants.ts

/**
 * @fileoverview Authentication Constants
 * @description Authentication constants - single source of truth for default behavior. Industry standard: redirect as default in production, popup in development. Defines auth method types and default configuration values.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { DISPLAY } from '@donotdev/components';
import type { AuthPartnerId, AuthMethod } from '@donotdev/core';

// Auth method, constants, and partner state — all defined in @donotdev/core
export { getAuthMethod, EMAIL_VERIFICATION_STATUS } from '@donotdev/core';
export type { AuthMethod, EmailVerificationStatus } from '@donotdev/core';
export {
  AUTH_PARTNER_STATE as PARTNER_STATE,
  type AuthPartnerState as PartnerState,
} from '@donotdev/core';

// =============================================================================
// Common Component Types
// =============================================================================

/**
 * Common size variants for UI components
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export type ComponentSize = 'sm' | 'md' | 'lg' | 'icon';

/**
 * Common form modes
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export type FormMode = 'signin' | 'signup';

/**
 * Common role types for access control
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export type AccessRole = 'user' | 'admin';

/**
 * Base props that most components share
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface BaseComponentProps {
  /** CSS class for the container element */
  className?: string;
  /** Additional CSS classes */
  id?: string;
}

/**
 * Props for components that handle authentication callbacks
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface AuthCallbackProps {
  /** Callback when authentication succeeds */
  onSuccess?: (result: any) => void;
  /** Callback when authentication fails */
  onError?: (error: Error) => void;
}

/**
 * Props for components that render children conditionally
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface ConditionalRenderProps {
  /** Children to render when condition is met */
  children: React.ReactNode;
  /** Fallback UI to render when condition is not met */
  fallback?: React.ReactNode;
}

// =============================================================================
// Specific Component Props
// =============================================================================

/**
 * Props for network status indicator
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface NetworkStatusIndicatorProps extends BaseComponentProps {
  showWhenOnline?: boolean;
}

/**
 * Props for login modal
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Props for email verification component
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface EmailVerificationProps extends BaseComponentProps {
  /** Text for the verify button */
  verifyButtonText?: string;
  /** Success message to display */
  successMessage?: string;
  /** Message to display while sending verification email */
  sendingMessage?: string;
  /** Message to display if email is already verified */
  alreadyVerifiedMessage?: string;
  /** Message to display if user is not signed in */
  notSignedInMessage?: string;
  /** Error message to display if verification fails */
  errorMessage?: string;
}

/**
 * Props for email/password form
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface EmailPasswordFormProps
  extends BaseComponentProps, AuthCallbackProps {
  /** Form mode - defaults to 'signin' */
  mode?: FormMode;
  compact?: boolean;
  /**
   * Terms of Service path or content (signup only - GDPR/French law).
   * - Omit: auto-detects from app config legalLinks, falls back to '/legal/terms'
   * - `string`: path opened in popup window
   * - `ReactNode`: rendered inline in a Dialog modal
   * - `false`: explicitly disable ToS requirement
   */
  tos?: string | React.ReactNode | false;
  /**
   * Privacy Policy path or content (signup only - GDPR/French law).
   * - Omit: auto-detects from app config legalLinks, falls back to '/legal/privacy'
   * - `string`: path opened in popup window
   * - `ReactNode`: rendered inline in a Dialog modal
   * - `false`: explicitly disable Privacy requirement
   */
  privacy?: string | React.ReactNode | false;
  /**
   * CAPTCHA token to include with auth requests.
   * Consumer is responsible for rendering the CAPTCHA widget (e.g. Turnstile)
   * and passing the token here. When provided, submit is blocked until token is truthy.
   */
  captchaToken?: string;
}

/**
 * Props for account linking component
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface AccountLinkingProps extends BaseComponentProps {}

/**
 * Props for Google One Tap component
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface GoogleOneTapProps extends AuthCallbackProps {
  /** Custom client ID (defaults to env variable) */
  clientId?: string;
}

/**
 * Props for rate limit alert
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface RateLimitAlertProps extends BaseComponentProps {
  /** Optional identifier for the rate limit context */
  identifier?: string;
}

/**
 * Props for password update dialog
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface PasswordUpdateDialogProps {
  updatePassword: (password: string) => Promise<void>;
}

/**
 * Props for auth partner button
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface AuthPartnerButtonProps
  extends AuthCallbackProps, BaseComponentProps {
  partnerId: AuthPartnerId;
  method?: AuthMethod | null;
  children?: React.ReactNode;
  disabled?: boolean;
  /**
   * Display - controls button presentation in preset layouts
   * - 'compact': Icon-only
   * - 'full': Icon + label
   * - 'auto': Responsive (default)
   * @default 'auto'
   */
  display?: (typeof DISPLAY)[keyof typeof DISPLAY];
}

/**
 * Props for feature placeholder
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface FeaturePlaceholderProps extends BaseComponentProps {
  /** The feature ID that's not available */
  featureId: string;
  /** Name of the feature (displayed to the user) */
  featureName: string;
}

/**
 * Props for tier placeholder
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface TierPlaceholderProps extends BaseComponentProps {
  /** Name of the feature (displayed to the user) */
  featureName: string;
  /** Custom placeholder content */
  children?: React.ReactNode;
}

/**
 * Props for auth fallback
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface AuthFallbackProps extends BaseComponentProps {
  /** Custom message to display */
  message?: string;
  /** Whether to show a login button (will be disabled) */
  showLoginButton?: boolean;
}

/**
 * Props for multiple auth providers
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface MultipleAuthProvidersProps extends BaseComponentProps {
  /** Providers to display (defaults to all available providers) */
  providers?: AuthPartnerId[];
  /** CSS class for each provider button */
  buttonClassName?: string;
}

'use client';
// packages/features/auth/src/components/FeatureGuard.tsx

/**
 * @fileoverview FeatureGuard - Component-level feature access control
 * @description Protects individual components based on user permissions, roles, and subscription tiers
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 *
 * This component provides granular feature access control within pages, allowing developers
 * to show/hide features based on user permissions without manual hook management.
 *
 * **Use Cases:**
 * - Show premium features only to pro users
 * - Hide admin features from regular users
 * - Display upgrade prompts for locked features
 * - Conditional rendering based on subscription status
 * - Protect individual UI components within pages
 *
 * **Architecture:**
 * - Uses useAuth() for permission checking
 * - Provides automatic fallback components
 * - Supports role, tier, and custom validation
 * - Graceful degradation when auth unavailable
 * - Integrates with existing AuthGuard for route-level protection
 *
 * **Usage Patterns:**
 *
 * Role-based access:
 * ```tsx
 * <FeatureGuard role="admin">
 * <AdminPanel />
 * </FeatureGuard>
 * ```
 *
 * Subscription tier access:
 * ```tsx
 * <FeatureGuard tier="pro" fallback={<UpgradePrompt />}>
 * <PremiumFeature />
 * </FeatureGuard>
 * ```
 *
 * Active subscription required:
 * ```tsx
 * <FeatureGuard subscription>
 * <SubscriberFeature />
 * </FeatureGuard>
 * ```
 *
 * Custom validation:
 * ```tsx
 * <FeatureGuard validate={(role, tier) => role === 'admin' && tier !== 'free'}>
 * <CustomFeature />
 * </FeatureGuard>
 * ```
 *
 * Multiple conditions:
 * ```tsx
 * <FeatureGuard role="admin" tier="pro" subscription>
 * <AdminPremiumFeature />
 * </FeatureGuard>
 * ```
 */

import { Stack } from '@donotdev/components';
import type { UserRole, SubscriptionTier } from '@donotdev/core';
import { hasRoleAccess, hasTierAccess } from '@donotdev/core';

import { useAuth } from '../useAuth';
import { AuthFallback } from './AuthFallback';

import type { ReactNode, ComponentType } from 'react';

/**
 * Props for FeatureGuard component
 */
export interface FeatureGuardProps {
  /** Children to render if access is granted */
  children: ReactNode;

  /** Required role(s) - user must have at least one */
  role?: UserRole | UserRole[];

  /** Required subscription tier */
  tier?: SubscriptionTier;

  /** Whether active subscription is required */
  subscription?: boolean;

  /** Custom validation function */
  validate?: (
    role: UserRole | undefined,
    tier: SubscriptionTier | undefined
  ) => boolean;

  /** Fallback component to show when access is denied */
  fallback?: ComponentType<{
    requiredRole?: UserRole | UserRole[];
    requiredTier?: SubscriptionTier;
    requiresSubscription?: boolean;
    userRole?: UserRole;
    userTier?: SubscriptionTier;
    hasSubscription?: boolean;
  }>;

  /** Custom message for fallback */
  message?: string;

  /** Whether to show upgrade prompt for tier restrictions */
  showUpgradePrompt?: boolean;

  /** Whether to show login prompt for auth restrictions */
  showLoginPrompt?: boolean;
}

/**
 * Default upgrade prompt component
 */
function UpgradePrompt({
  requiredTier,
  userTier,
}: {
  requiredTier?: string;
  userTier?: string;
}) {
  return (
    <div
      className="dndev-surface"
      data-variant="default"
      data-shadow="sm"
      data-radius="lg"
      style={{
        padding: 'var(--gap-md)',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--muted)',
      }}
    >
      <Stack direction="row" align="center">
        <span style={{ color: 'var(--accent)' }}>🔒</span>
        <div>
          <p
            style={{
              fontWeight: 500,
              fontSize: 'var(--font-size-base)',
              color: 'var(--foreground)',
            }}
          >
            {requiredTier === 'pro' ? 'Pro Feature' : 'Premium Feature'}
          </p>
          <p
            style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--muted-foreground)',
            }}
          >
            Upgrade to {requiredTier} to access this feature
            {userTier && ` (current: ${userTier})`}
          </p>
        </div>
      </Stack>
    </div>
  );
}

/**
 * Default access denied component
 */
function AccessDenied({
  requiredRole,
  userRole,
}: {
  requiredRole?: string | string[];
  userRole?: string;
}) {
  const roleText = Array.isArray(requiredRole)
    ? requiredRole.join(' or ')
    : requiredRole;

  return (
    <div
      className="dndev-surface"
      data-variant="destructive"
      data-shadow="sm"
      data-radius="lg"
      style={{
        padding: 'var(--gap-md)',
        border: '1px solid var(--destructive)',
        backgroundColor: 'var(--muted)',
      }}
    >
      <Stack direction="row" align="center">
        <span style={{ color: 'var(--destructive)' }}>🚫</span>
        <div>
          <p
            style={{
              fontWeight: 500,
              fontSize: 'var(--font-size-base)',
              color: 'var(--destructive-foreground)',
            }}
          >
            Access Denied
          </p>
          <p
            style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--muted-foreground)',
            }}
          >
            This feature requires {roleText} role
            {userRole && ` (current: ${userRole})`}
          </p>
        </div>
      </Stack>
    </div>
  );
}

/**
 * Default subscription expired component
 */
function SubscriptionExpired() {
  return (
    <div
      className="dndev-surface"
      data-variant="default"
      data-shadow="sm"
      data-radius="lg"
      style={{
        padding: 'var(--gap-md)',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--muted)',
      }}
    >
      <Stack direction="row" align="center">
        <span style={{ color: 'var(--accent)' }}>⏰</span>
        <div>
          <p
            style={{
              fontWeight: 500,
              fontSize: 'var(--font-size-base)',
              color: 'var(--foreground)',
            }}
          >
            Subscription Required
          </p>
          <p
            style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--muted-foreground)',
            }}
          >
            This feature requires an active subscription
          </p>
        </div>
      </Stack>
    </div>
  );
}

/**
 * FeatureGuard component that protects individual components based on user permissions
 *
 * Provides granular feature access control within pages, allowing developers to show/hide
 * features based on user permissions without manual hook management. This complements
 * the route-level AuthGuard by providing component-level protection within pages.
 *
 * **Key Features:**
 * - Role-based access control (user, admin)
 * - Subscription tier validation (free, pro, premium)
 * - Active subscription requirement checking
 * - Custom validation functions
 * - Automatic fallback components with context
 * - Graceful degradation when auth unavailable
 * - Loading state handling
 *
 * **Fallback Behavior:**
 * - Shows loading skeleton while auth state loads
 * - Displays AuthFallback for unauthenticated users (if showLoginPrompt=true)
 * - Shows UpgradePrompt for tier restrictions (if showUpgradePrompt=true)
 * - Displays AccessDenied for role restrictions
 * - Shows SubscriptionExpired for subscription requirements
 * - Renders custom fallback if provided
 * - Returns null if no fallback should be shown
 *
 * **Performance:**
 * - Uses useAuth() hook for reactive updates
 * - Memoizes permission checks
 * - Minimal re-renders on auth state changes
 * - Lazy loading compatible
 *
 * @param props - FeatureGuard configuration
 * @returns Protected component or fallback component
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function FeatureGuard({
  children,
  role,
  tier,
  subscription,
  validate,
  fallback: CustomFallback,
  message,
  showUpgradePrompt = true,
  showLoginPrompt = true,
}: FeatureGuardProps) {
  // Get state (reactive)
  const user = useAuth('user');
  const loading = useAuth('loading');
  const userProfile = useAuth('userProfile');
  const userSubscription = useAuth('userSubscription');

  // Extract role and tier from user types
  const userRole = userProfile?.role as string | undefined;
  const userTier = userSubscription?.tier as string | undefined;

  // Still loading auth state
  if (loading) {
    return (
      <div
        style={{
          height: '2rem',
          borderRadius: 'var(--radius)',
          backgroundColor: 'var(--muted)',
          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        }}
      />
    );
  }

  // Auth not available - show fallback
  if (!user && (role || tier || subscription)) {
    if (showLoginPrompt) {
      return (
        <AuthFallback
          message={message || 'Please sign in to access this feature'}
        />
      );
    }
    return null;
  }

  // For security checks, we need to use async methods
  // This component will need to be updated to handle async security checks
  // For now, we'll use the cached values for display purposes

  // Check role requirements using hierarchy (admin can access user routes, etc.)
  if (role) {
    const requiredRoles = Array.isArray(role) ? role : [role];
    const hasRequiredRole = requiredRoles.some((requiredRole) =>
      hasRoleAccess(userRole, requiredRole)
    );

    if (!hasRequiredRole) {
      if (CustomFallback) {
        return (
          <CustomFallback
            requiredRole={role}
            userRole={userRole || undefined}
          />
        );
      }
      return (
        <AccessDenied requiredRole={role} userRole={userRole || undefined} />
      );
    }
  }

  // Check subscription tier requirement (using cached values for now)
  // Uses tier hierarchy: higher tiers can access lower tier routes
  if (tier && !hasTierAccess(userTier, tier)) {
    if (CustomFallback) {
      return (
        <CustomFallback requiredTier={tier} userTier={userTier || 'free'} />
      );
    }
    if (showUpgradePrompt) {
      return (
        <UpgradePrompt requiredTier={tier} userTier={userTier || 'free'} />
      );
    }
    return null;
  }

  // Check active subscription requirement
  if (subscription && !userSubscription?.isActive) {
    if (CustomFallback) {
      return (
        <CustomFallback
          requiresSubscription={true}
          hasSubscription={userSubscription?.isActive || false}
        />
      );
    }
    return <SubscriptionExpired />;
  }

  // Check custom validation — always run when validate is provided
  if (validate) {
    if (!validate(userRole, userTier)) {
      if (CustomFallback) {
        return <CustomFallback userRole={userRole} userTier={userTier} />;
      }
      return <AccessDenied userRole={userRole} />;
    }
  }

  // All checks passed, render children
  return <>{children}</>;
}

/**
 * Hook to check if current user can access a feature
 *
 * Provides programmatic access to feature permission checking without
 * rendering components. Useful for conditional logic, analytics, and
 * programmatic feature access validation.
 *
 * **Use Cases:**
 * - Conditional rendering logic
 * - Analytics and tracking
 * - API endpoint protection
 * - Dynamic UI state management
 * - Feature flag evaluation
 *
 * **Performance:**
 * - Reactive to auth state changes
 * - Memoized results
 * - No component re-renders
 * - Lightweight permission checking
 *
 * @param config - Feature access configuration
 * @returns True if user can access the feature, false otherwise
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function useCanAccessFeature(config: {
  role?: UserRole | UserRole[];
  tier?: SubscriptionTier;
  subscription?: boolean;
  validate?: (
    role: UserRole | undefined,
    tier: SubscriptionTier | undefined
  ) => boolean;
}): boolean {
  // Get state (reactive)
  const user = useAuth('user');
  const userProfile = useAuth('userProfile');
  const userSubscription = useAuth('userSubscription');

  // Extract role and tier from user types
  const userRole = userProfile?.role as string | undefined;
  const userTier = userSubscription?.tier as string | undefined;

  // Not authenticated and auth required
  if (!user && (config.role || config.tier || config.subscription)) {
    return false;
  }

  // Check role requirements using hierarchy (admin can access user routes, etc.)
  if (config.role) {
    const requiredRoles = Array.isArray(config.role)
      ? config.role
      : [config.role];
    const hasRequiredRole = requiredRoles.some((requiredRole) =>
      hasRoleAccess(userRole, requiredRole)
    );
    if (!hasRequiredRole) return false;
  }

  // Check subscription tier requirement (using cached values)
  // Uses tier hierarchy: higher tiers can access lower tier routes
  if (config.tier && !hasTierAccess(userTier, config.tier)) {
    return false;
  }

  // Check active subscription requirement
  if (config.subscription && !userSubscription?.isActive) {
    return false;
  }

  // Check custom validation
  if (config.validate && userRole && userTier) {
    if (!config.validate(userRole, userTier)) {
      return false;
    }
  }

  return true;
}

/**
 * Higher-order component that wraps components with feature protection
 *
 * Provides a declarative way to protect entire components based on user permissions.
 * Useful for protecting complex components, third-party components, or creating
 * reusable protected component variants.
 *
 * **Use Cases:**
 * - Protecting third-party components
 * - Creating reusable protected component variants
 * - Wrapping complex components with multiple dependencies
 * - Creating admin-only or premium-only component versions
 *
 * **Benefits:**
 * - Declarative protection configuration
 * - Reusable protected components
 * - Clean component composition
 * - Automatic display name generation
 *
 * @param Component - Component to protect
 * @param config - Feature access configuration
 * @returns Wrapped component with feature protection
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function withFeatureGuard<P extends object>(
  Component: ComponentType<P>,
  config: Omit<FeatureGuardProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <FeatureGuard {...config}>
      <Component {...props} />
    </FeatureGuard>
  );

  return WrappedComponent;
}

// Export default fallback components for easy customization
export { UpgradePrompt, AccessDenied, SubscriptionExpired };

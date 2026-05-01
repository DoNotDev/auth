'use client';
// packages/features/auth/src/components/FeaturePlaceholder.tsx

/**
 * @fileoverview Feature placeholder components for DoNotDev framework
 * @description Components for showing placeholders when features are not available
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { cn } from '@donotdev/components';
import { hasTierAccess } from '@donotdev/core';

import { useAuth } from '../useAuth';

import type { ReactNode } from 'react';

/**
 * Props for the FeaturePlaceholder component
 */
interface FeaturePlaceholderProps {
  /** The feature ID that's not available */
  featureId: string;
  /** Name of the feature (displayed to the user) */
  featureName: string;
  /** Additional CSS classes */
  className?: string;
  /** Custom placeholder content */
  children?: ReactNode;
}

/**
 * Props for the tier-specific placeholder components
 */
interface TierPlaceholderProps {
  /** Name of the feature (displayed to the user) */
  featureName: string;
  /** Additional CSS classes */
  className?: string;
  /** Custom placeholder content */
  children?: ReactNode;
}

/**
 * A simple placeholder shown when a feature is not available
 * Deliberately minimal and non-promotional
 *
 * @example
 * ```tsx
 * <FeaturePlaceholder
 * featureId="cloud-sync"
 * featureName="Cloud Synchronization"
 * />
 * ```
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function FeaturePlaceholder({
  featureId,
  featureName,
  className = '',
  children,
}: FeaturePlaceholderProps) {
  // Get userSubscription state (reactive)
  const userSubscription = useAuth('userSubscription');

  // If the user has access to the feature, don't show the placeholder
  const hasAccess = userSubscription?.features?.includes(featureId) || false;
  if (hasAccess) {
    return null;
  }

  // Default placeholder if no children provided
  const defaultPlaceholder = (
    <div
      className={cn('dndev-surface', className)}
      data-variant="muted"
      data-shadow="none"
      data-radius="lg"
      style={{
        padding: 'var(--gap-md)',
        border: '1px dashed var(--border)',
        backgroundColor: 'var(--muted)',
      }}
    >
      <p
        style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--muted-foreground)',
          textAlign: 'center',
        }}
      >
        {featureName} is not available on your current plan.
      </p>
    </div>
  );

  // Return custom children or default placeholder
  return children || defaultPlaceholder;
}

/**
 * Creates a tier-specific feature placeholder
 *
 * @param tier - The subscription tier for this placeholder
 * @param tierName - Display name for the tier (e.g., "Pro", "AI")
 * @returns A component for showing placeholders for specific tier features
 */
function createTierPlaceholder(tier: string, tierName: string) {
  return function TierPlaceholder({
    featureName,
    className = '',
    children,
  }: TierPlaceholderProps) {
    // Get userSubscription state (reactive)
    const userSubscription = useAuth('userSubscription');

    // If the user has access to the tier (via hierarchy), don't show the placeholder
    const hasAccess = hasTierAccess(userSubscription?.tier, tier);
    if (hasAccess) {
      return null;
    }

    // Default placeholder if no children provided
    const defaultPlaceholder = (
      <div
        className={cn('dndev-surface', className)}
        data-variant="muted"
        data-shadow="none"
        data-radius="lg"
        style={{
          padding: 'var(--gap-md)',
          border: '1px dashed var(--border)',
          backgroundColor: 'var(--muted)',
        }}
      >
        <p
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--muted-foreground)',
            textAlign: 'center',
          }}
        >
          {featureName} is only available on {tierName} tier.
        </p>
      </div>
    );

    // Return custom children or default placeholder
    return children || defaultPlaceholder;
  };
}

/**
 * Placeholder for Pro tier features
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const ProFeaturePlaceholder = createTierPlaceholder('pro', 'Pro');

/**
 * Placeholder for Premium tier features
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const PremiumFeaturePlaceholder = createTierPlaceholder(
  'premium',
  'Premium'
);

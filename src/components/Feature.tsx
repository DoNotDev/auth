'use client';
// packages/features/auth/src/components/Feature.tsx

/**
 * @fileoverview Feature access components for DoNotDev framework
 * @description Components for conditionally rendering content based on subscription features
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useRef, useImperativeHandle, forwardRef } from 'react';
import type { ReactNode } from 'react';

import { hasTierAccess } from '@donotdev/core';

import { useAuth } from '../useAuth';

interface BaseFeatureProps {
  /** UI to render when the feature is not available */
  fallback?: ReactNode;

  /** Content to render when the feature is available */
  children: ReactNode;
}

/**
 * Feature ref interface
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface FeatureRef {
  /** Access to whether the feature is enabled */
  enabled: boolean;
}

/**
 * Feature props interface
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface FeatureProps extends BaseFeatureProps {
  /** The feature ID to check access for */
  featureId: string;
}

/**
 * Tier feature props interface
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface TierFeatureProps extends BaseFeatureProps {
  /** The tier to check access for */
  tier?: string;
}

/**
 * Component that conditionally renders content based on subscription features
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const Feature = forwardRef<FeatureRef, FeatureProps>(
  ({ featureId, fallback = null, children }, ref) => {
    // Get userSubscription state (reactive)
    const userSubscription = useAuth('userSubscription');

    // Use cached subscription data for display
    const enabled = userSubscription?.features?.includes(featureId) || false;

    // Expose enabled state via ref
    useImperativeHandle(
      ref,
      () => ({
        enabled,
      }),
      [enabled]
    );

    if (!enabled) {
      return fallback ? <>{fallback}</> : null;
    }

    return <>{children}</>;
  }
);

/**
 * Base component for tier-specific features
 */
const TierFeature = forwardRef<FeatureRef, TierFeatureProps>(
  ({ tier, fallback = null, children }, ref) => {
    // Get userSubscription state (reactive)
    const userSubscription = useAuth('userSubscription');

    // Default to 'pro' tier if not specified
    // Uses tier hierarchy: higher tiers can access lower tier features
    const targetTier = tier || 'pro';
    const enabled = hasTierAccess(userSubscription?.tier, targetTier);

    // Expose enabled state via ref
    useImperativeHandle(
      ref,
      () => ({
        enabled,
      }),
      [enabled]
    );

    if (!enabled) {
      return fallback ? <>{fallback}</> : null;
    }

    return <>{children}</>;
  }
);

/**
 * Component that renders content only for users with Pro tier or higher
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const ProFeature = forwardRef<
  FeatureRef,
  Omit<TierFeatureProps, 'tier'>
>((props, ref) => {
  return <TierFeature ref={ref} tier="pro" {...props} />;
});

/**
 * Component that renders content only for users with Premium tier
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const PremiumFeature = forwardRef<
  FeatureRef,
  Omit<TierFeatureProps, 'tier'>
>((props, ref) => {
  return <TierFeature ref={ref} tier="premium" {...props} />;
});

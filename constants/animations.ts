/**
 * Animation constants for consistent timing across the application
 * Centralized to avoid magic numbers and ensure consistency
 */

export const ANIMATION_DELAYS = {
  /** Base delay for stagger animations in SavedDeals */
  STAGGER_BASE: 100,
  /** Increment between staggered items */
  STAGGER_INCREMENT: 60,
  /** Toast notification display duration */
  TOAST_DURATION: 3000,
  /** Tab transition duration */
  TAB_TRANSITION: 300,
  /** Entrance animation delay */
  ENTRANCE_DELAY: 0,
  /** Modal animation duration */
  MODAL_DURATION: 300,
} as const;

export const ANIMATION_EASINGS = {
  /** Standard easing for most animations */
  STANDARD: "cubic-bezier(0.4, 0, 0.2, 1)",
  /** Bounce easing for playful interactions */
  BOUNCE: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  /** Spring easing for natural motion */
  SPRING: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
  /** Smooth easing for entrance */
  SMOOTH: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

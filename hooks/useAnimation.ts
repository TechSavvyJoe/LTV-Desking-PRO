import { useEffect, useState } from "react";
import { ANIMATION_DELAYS } from "../constants/animations";

/**
 * Hook for entrance animations with stagger support
 * @param delay - Delay in milliseconds before animation starts
 * @returns Boolean indicating if animation should be active
 */
export const useEntranceAnimation = (delay: number = 0): boolean => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  return isVisible;
};

/**
 * Hook for staggered list animations
 * @param itemCount - Number of items in the list
 * @param baseDelay - Base delay in milliseconds
 * @param staggerDelay - Delay between each item in milliseconds
 * @returns Array of visibility states for each item
 */
export const useStaggerAnimation = (
  itemCount: number,
  baseDelay: number = 0,
  staggerDelay: number = 50
): boolean[] => {
  const [visibleItems, setVisibleItems] = useState<boolean[]>(
    new Array(itemCount).fill(false)
  );

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    for (let i = 0; i < itemCount; i++) {
      const timer = setTimeout(() => {
        setVisibleItems((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }, baseDelay + i * staggerDelay);

      timers.push(timer);
    }

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [itemCount, baseDelay, staggerDelay]);

  return visibleItems;
};

/**
 * Hook to detect if user prefers reduced motion
 * @returns Boolean indicating if reduced motion is preferred
 */
export const usePrefersReducedMotion = (): boolean => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return prefersReducedMotion;
};

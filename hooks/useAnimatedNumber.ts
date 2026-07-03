import { useEffect, useRef, useState } from "react";

/** True when the user has asked the OS to minimize motion. */
const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * Tween a number toward `target` with the dc mockup's 600ms easeOutCubic
 * curve (requestAnimationFrame driven). When `target` changes mid-flight the
 * tween restarts from the currently displayed value; the frame is cancelled
 * on unmount. Under prefers-reduced-motion the target is returned
 * immediately — no tween. [dc-redesign]
 */
export function useAnimatedNumber(target: number, duration = 600): number {
  const reduced = prefersReducedMotion();
  const [value, setValue] = useState(target);
  // Latest displayed value — the starting point for the next tween.
  const currentRef = useRef(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced || duration <= 0) {
      currentRef.current = target;
      setValue(target);
      return;
    }

    const from = currentRef.current;
    if (from === target) return;

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const next = from + (target - from) * easeOutCubic(t);
      currentRef.current = next;
      setValue(next);
      frameRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [target, duration, reduced]);

  return reduced ? target : value;
}

export default useAnimatedNumber;

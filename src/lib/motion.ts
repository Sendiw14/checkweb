import type { Transition, Variants } from "motion/react";
import { TOKENS } from "@/lib/design-tokens";

/**
 * Central motion system. Durations stay in the 120–250ms band for interaction
 * feedback; only entrances of whole surfaces use the slower value. The app wraps
 * everything in <MotionConfig reducedMotion="user">, so transform animations are
 * disabled automatically for people who ask for less motion.
 */
export const duration = TOKENS.motion.duration;
export const ease = TOKENS.motion.ease.out as unknown as [number, number, number, number];

export const t = {
  instant: { duration: duration.instant, ease } satisfies Transition,
  fast: { duration: duration.fast, ease } satisfies Transition,
  base: { duration: duration.base, ease } satisfies Transition,
  slow: { duration: duration.slow, ease } satisfies Transition,
} as const;

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: t.base },
  exit: { opacity: 0, transition: t.instant },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: t.base },
  exit: { opacity: 0, y: 4, transition: t.instant },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: t.base },
  exit: { opacity: 0, scale: 0.98, transition: t.instant },
};

export const stagger = (step = 0.04, delay = 0): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: step, delayChildren: delay } },
});

export const listItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: t.base },
};

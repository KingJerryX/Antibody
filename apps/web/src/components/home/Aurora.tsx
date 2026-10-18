"use client";

import { motion, useReducedMotion } from "motion/react";

/** Soft pools of green light. Long, mismatched loop lengths keep the drift from ever visibly repeating. */
const POOLS = [
  { left: "-12%", top: "-28%", size: 980, color: "rgba(127, 238, 100, 0.11)", x: ["0%", "9%", "-4%"], y: ["0%", "7%", "12%"], duration: 31 },
  { left: "58%", top: "-18%", size: 760, color: "rgba(92, 214, 140, 0.08)", x: ["0%", "-8%", "5%"], y: ["0%", "10%", "-4%"], duration: 37 },
  { left: "22%", top: "38%", size: 1100, color: "rgba(127, 238, 100, 0.06)", x: ["0%", "6%", "-7%"], y: ["0%", "-8%", "5%"], duration: 43 },
  { left: "-20%", top: "70%", size: 820, color: "rgba(60, 170, 110, 0.07)", x: ["0%", "10%", "3%"], y: ["0%", "-6%", "-12%"], duration: 47 },
];

/** The home page's living backdrop: fixed behind everything, still when the viewer prefers reduced motion. */
export function Aurora() {
  const reduce = useReducedMotion();
  return (
    <div className="aurora" aria-hidden="true">
      {POOLS.map((pool, i) => (
        <motion.div
          key={i}
          className="aurora-pool"
          style={{ left: pool.left, top: pool.top, width: pool.size, height: pool.size, background: `radial-gradient(circle at center, ${pool.color}, transparent 66%)` }}
          animate={reduce ? undefined : { x: pool.x, y: pool.y, scale: [1, 1.12, 0.94] }}
          transition={{ duration: pool.duration, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

"use client";

import { motion } from "motion/react";

import { useReducedMotion } from "@/lib/motion";

/** Entrada suave ao aparecer na tela. Sem movimento quando o sistema pede menos animação. */
export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section";
}) {
  const reduced = useReducedMotion();
  const Tag = as === "section" ? motion.section : motion.div;
  return (
    <Tag
      className={className}
      initial={reduced ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </Tag>
  );
}

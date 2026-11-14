"use client";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
  gsap.defaults({ ease: "expo.out", duration: 1 });
}

export { gsap, ScrollTrigger, useGSAP };

export const JOIN_URL =
  "https://app.wotboyz.com/join?utm_source=ig&utm_medium=paid&utm_campaign=WB+Join+-+Sign-ups+-+Nov26&utm_content=ride-videos-v1&utm_id=120250475335120008&utm_term=120250475335100008";

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const isDesktop = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)").matches;

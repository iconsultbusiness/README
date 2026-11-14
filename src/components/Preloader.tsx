"use client";
import { useRef, useState } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";

export function Preloader() {
  const root = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);

  useGSAP(() => {
    const el = root.current!;
    if (prefersReducedMotion() || sessionStorage.getItem("bc-loaded")) {
      setDone(true); return;
    }
    const lenis = (window as unknown as { lenis?: { stop: () => void; start: () => void } }).lenis;
    lenis?.stop();
    const counter = { v: 0 };
    const num = el.querySelector<HTMLElement>(".num")!;
    const tl = gsap.timeline({
      onComplete: () => { sessionStorage.setItem("bc-loaded", "1"); lenis?.start(); setDone(true); },
    });
    tl.to(counter, { v: 100, duration: 1.6, ease: "power2.inOut", onUpdate: () => (num.textContent = String(Math.round(counter.v)).padStart(3, "0")) })
      .fromTo(".etch-wipe", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 1.6, ease: "power2.inOut" }, 0)
      .to(".pl-meta", { opacity: 0, y: -10, duration: 0.4 }, "-=0.1")
      .to(".etch-wipe", { scale: 1.06, opacity: 0, duration: 0.7, ease: "power2.in" }, "<")
      .to(el, { yPercent: -100, duration: 1, ease: "expo.inOut" }, "-=0.3");
  }, { scope: root });

  if (done) return null;
  return (
    <div ref={root} className="fixed inset-0 z-[100] flex items-center justify-center bg-ink" aria-hidden>
      <img src="/brand/emblem-line.svg" alt="" className="etch-wipe w-[min(70vw,640px)] [clip-path:inset(0_100%_0_0)]" />
      <div className="pl-meta absolute bottom-8 left-[var(--gutter)] right-[var(--gutter)] flex items-end justify-between">
        <span className="label">Bike Culture — loading</span>
        <span className="num display text-[clamp(3rem,8vw,6rem)] tabular-nums text-bone">000</span>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useRef } from "react";
import { gsap, isDesktop, prefersReducedMotion } from "@/lib/gsap";

/** Dot + ring cursor. Elements opt in to a label with data-cursor="View". */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isDesktop() || prefersReducedMotion()) return;
    document.documentElement.classList.add("has-cursor");
    const d = dot.current!, r = ring.current!, l = label.current!;
    const xTo = gsap.quickTo(r, "x", { duration: 0.5, ease: "power3.out" });
    const yTo = gsap.quickTo(r, "y", { duration: 0.5, ease: "power3.out" });
    const dx = gsap.quickTo(d, "x", { duration: 0.12, ease: "power3.out" });
    const dy = gsap.quickTo(d, "y", { duration: 0.12, ease: "power3.out" });
    gsap.set([d, r], { xPercent: -50, yPercent: -50, opacity: 0 });

    let shown = false;
    const move = (e: PointerEvent) => {
      if (!shown) { gsap.to([d, r], { opacity: 1, duration: 0.3 }); shown = true; }
      xTo(e.clientX); yTo(e.clientY); dx(e.clientX); dy(e.clientY);
    };
    const over = (e: PointerEvent) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-cursor], a, button");
      if (!t) return;
      const text = t.dataset.cursor;
      if (text) {
        l.textContent = text;
        gsap.to(r, { scale: 4.2, backgroundColor: "rgba(212,21,28,0.92)", borderColor: "transparent", duration: 0.5 });
        gsap.to(l, { opacity: 1, duration: 0.3, delay: 0.1 });
        gsap.to(d, { opacity: 0, duration: 0.2 });
      } else {
        gsap.to(r, { scale: 1.8, duration: 0.4 });
      }
    };
    const out = (e: PointerEvent) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-cursor], a, button");
      if (!t) return;
      gsap.to(r, { scale: 1, backgroundColor: "rgba(0,0,0,0)", borderColor: "rgba(236,233,226,0.6)", duration: 0.5 });
      gsap.to(l, { opacity: 0, duration: 0.2 });
      gsap.to(d, { opacity: 1, duration: 0.2 });
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.documentElement.classList.remove("has-cursor");
    };
  }, []);

  return (
    <>
      <div ref={dot} className="pointer-events-none fixed left-0 top-0 z-[90] h-1.5 w-1.5 rounded-full bg-bone opacity-0 mix-blend-difference" />
      <div ref={ring} className="pointer-events-none fixed left-0 top-0 z-[90] flex h-9 w-9 items-center justify-center rounded-full border border-bone/60 opacity-0">
        <span ref={label} className="label !text-[2.6px] !tracking-[0.18em] text-bone opacity-0">View</span>
      </div>
    </>
  );
}

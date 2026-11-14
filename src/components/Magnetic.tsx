"use client";
import { useRef } from "react";
import { gsap, useGSAP, isDesktop } from "@/lib/gsap";

export function Magnetic({ children, strength = 0.35, className = "" }: { children: React.ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!isDesktop()) return;
    const el = ref.current!;
    const xTo = gsap.quickTo(el, "x", { duration: 0.8, ease: "elastic.out(1, 0.45)" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.8, ease: "elastic.out(1, 0.45)" });
    const move = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
      xTo((e.clientX - (b.left + b.width / 2)) * strength);
      yTo((e.clientY - (b.top + b.height / 2)) * strength);
    };
    const leave = () => { xTo(0); yTo(0); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); };
  }, { scope: ref });
  return <div ref={ref} className={`inline-block ${className}`}>{children}</div>;
}

export function Button({ href, children, ghost = false, external = true }: { href: string; children: string; ghost?: boolean; external?: boolean }) {
  return (
    <Magnetic>
      <a
        href={href}
        className={`btn ${ghost ? "btn-ghost" : ""}`}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        <span className="btn-label"><span>{children}<br />{children}</span></span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><path d="M2 12 12 2M5 2h7v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" /></svg>
      </a>
    </Magnetic>
  );
}

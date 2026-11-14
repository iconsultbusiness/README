"use client";
import { useRef } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { content } from "@/lib/content";

export function Manifesto() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const words = root.current!.querySelectorAll(".mw");
    if (prefersReducedMotion()) { gsap.set(words, { opacity: 1 }); return; }
    const mm = gsap.matchMedia();
    mm.add("(min-width: 768px)", () => {
      gsap.fromTo(words, { opacity: 0.12 }, {
        opacity: 1, stagger: 0.08, ease: "none",
        scrollTrigger: { trigger: root.current, start: "top top", end: "+=160%", pin: true, scrub: 0.6, anticipatePin: 1 },
      });
    });
    mm.add("(max-width: 767px)", () => {
      gsap.fromTo(words, { opacity: 0.12 }, {
        opacity: 1, stagger: 0.05, ease: "none",
        scrollTrigger: { trigger: root.current, start: "top 70%", end: "bottom 60%", scrub: 0.6 },
      });
    });
    return () => mm.revert();
  }, { scope: root });

  // *word* → serif italic
  const tokens = content.manifesto.split(" ");
  return (
    <section ref={root} className="relative flex min-h-[100svh] items-center bg-ink px-[var(--gutter)] py-32">
      <p className="label absolute left-[var(--gutter)] top-10">Manifesto</p>
      <p className="label absolute right-[var(--gutter)] top-10 text-right">01 / One pride</p>
      <p className="display-wide max-w-[20ch] text-[clamp(1.9rem,4.6vw,5.2rem)] !leading-[1.05] !tracking-[-0.01em] text-bone md:max-w-[22ch]">
        {tokens.map((t, i) => {
          const serif = t.startsWith("*");
          const clean = t.replace(/\*/g, "");
          return <span key={i} className={`mw inline-block ${serif ? "serif-it text-signal" : ""}`}>{clean}&nbsp;</span>;
        })}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/etch.svg" alt="" aria-hidden className="pointer-events-none absolute -bottom-[8%] -right-[12%] w-[70vw] opacity-[0.07] [filter:invert(1)]" />
    </section>
  );
}

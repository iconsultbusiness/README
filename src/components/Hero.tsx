"use client";
import { useRef } from "react";
import { gsap, useGSAP, JOIN_URL, isDesktop, prefersReducedMotion } from "@/lib/gsap";
import { Button } from "./Magnetic";
import { content } from "@/lib/content";

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(() => {
    const q = gsap.utils.selector(root);
    const reduced = prefersReducedMotion();
    const intro = gsap.timeline({ delay: reduced ? 0 : 0.2 });
    if (!reduced) {
      intro
        .fromTo(q(".hero-plate"), { scale: 1.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 2.4, ease: "power2.out" }, 0)
        .fromTo(q(".w-line > span"), { yPercent: 115 }, { yPercent: 0, duration: 1.4, stagger: 0.12 }, 0.3)
        .fromTo(q(".hero-emblem"), { clipPath: "inset(50% 0 50% 0)", scale: 1.1 }, { clipPath: "inset(0% 0 0% 0)", scale: 1, duration: 1.6, ease: "expo.inOut" }, 0.5)
        .fromTo(q(".horizon"), { scaleX: 0 }, { scaleX: 1, duration: 1.6, ease: "expo.inOut" }, 0.6)
        .fromTo(q(".hero-meta"), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 1, stagger: 0.1 }, 1.1);

      // scroll: type drifts up, emblem lags and dims
      gsap.to(q(".hero-type"), { yPercent: -18, ease: "none", scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true } });
      gsap.to(q(".hero-emblem"), { yPercent: 22, scale: 0.92, ease: "none", scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true } });
      gsap.to(q(".hero-plate"), { yPercent: 12, scale: 1.08, ease: "none", scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true } });
      gsap.to(q(".hero-meta, .scroll-hint"), { opacity: 0, ease: "none", scrollTrigger: { trigger: root.current, start: "top top", end: "40% top", scrub: true } });
    }

    // pointer parallax (desktop)
    if (isDesktop() && !reduced) {
      const ex = gsap.quickTo(q(".hero-emblem")[0], "x", { duration: 1.2, ease: "power3.out" });
      const ey = gsap.quickTo(q(".hero-emblem")[0], "y", { duration: 1.2, ease: "power3.out" });
      const tx = gsap.quickTo(q(".hero-type"), "x", { duration: 1.6, ease: "power3.out" });
      const onMove = (e: PointerEvent) => {
        const nx = e.clientX / window.innerWidth - 0.5, ny = e.clientY / window.innerHeight - 0.5;
        ex(nx * 26); ey(ny * 18); tx(-nx * 12);
      };
      window.addEventListener("pointermove", onMove, { passive: true });
      return () => window.removeEventListener("pointermove", onMove);
    }
  }, { scope: root });

  return (
    <section ref={root} id="top" className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden bg-ink">
      {/* plate */}
      <div className="hero-plate pointer-events-none absolute inset-0 opacity-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/media/pack-night.jpg" alt="" aria-hidden fetchPriority="high" className="h-full w-full object-cover opacity-[0.28] [filter:saturate(0.7)_contrast(1.1)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(10,10,12,0)_0%,rgba(10,10,12,0.6)_60%,#0a0a0c_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink to-transparent" />
      </div>

      {/* red horizon */}
      <div className="horizon pointer-events-none absolute left-0 right-0 top-[58%] h-px origin-left bg-signal/80 md:top-[56%]" />

      {/* composition */}
      <div className="relative mx-auto flex w-full flex-1 flex-col items-center justify-center pt-24">
        <div className="hero-type relative z-[1] text-center">
          <span className="w-line line-mask display block text-[length:var(--d1)] text-bone"><span>Bike</span></span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/emblem-steel.svg"
          alt="Bike Culture lion emblem"
          fetchPriority="high"
          className="hero-emblem relative z-[2] -my-[1.5vw] w-[min(64vw,520px)] drop-shadow-[0_30px_60px_rgba(0,0,0,0.7)] md:-my-[3vw] md:w-[min(44vw,720px)]"
        />
        <div className="hero-type relative z-[3] text-center">
          <span className="w-line line-mask display block text-[length:var(--d1)] text-bone"><span>Culture</span></span>
        </div>
      </div>

      {/* meta row */}
      <div className="relative z-[4] grid grid-cols-2 items-end gap-6 px-[var(--gutter)] pb-8 md:grid-cols-3">
        <div className="hero-meta">
          <p className="label mb-2">{content.hero.kicker}</p>
          <p className="body max-w-[26ch] !text-bone/80">{content.hero.sub}</p>
        </div>
        <div className="scroll-hint hidden flex-col items-center gap-3 md:flex">
          <span className="label">Scroll</span>
          <span className="relative block h-12 w-px overflow-hidden bg-steel"><span className="absolute inset-x-0 top-0 h-1/2 animate-[hint_1.6s_ease-in-out_infinite] bg-bone" /></span>
        </div>
        <div className="hero-meta flex justify-end">
          <Button href={JOIN_URL}>{content.hero.cta}</Button>
        </div>
      </div>
      <style>{`@keyframes hint{0%{transform:translateY(-100%)}100%{transform:translateY(200%)}}`}</style>
    </section>
  );
}

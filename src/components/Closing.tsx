"use client";
import { useRef } from "react";
import { gsap, useGSAP, JOIN_URL, prefersReducedMotion } from "@/lib/gsap";
import { content } from "@/lib/content";
import { Button } from "./Magnetic";

export function Closing() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    const q = gsap.utils.selector(root);
    gsap.fromTo(q(".plate img"), { scale: 1.25, yPercent: -6 }, { scale: 1, yPercent: 6, ease: "none", scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", scrub: 1 } });
    gsap.from(q(".line-mask > span"), { yPercent: 110, stagger: 0.12, duration: 1.4, scrollTrigger: { trigger: root.current, start: "top 55%", once: true } });
    gsap.from(q(".close-cta"), { opacity: 0, y: 20, duration: 1, delay: 0.5, scrollTrigger: { trigger: root.current, start: "top 55%", once: true } });
    gsap.fromTo(q(".close-etch"), { yPercent: 10, rotate: -2 }, { yPercent: -10, rotate: 2, ease: "none", scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", scrub: 1 } });
  }, { scope: root });

  return (
    <section ref={root} className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden bg-ink">
      <div className="plate absolute inset-0 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/media/dawn-road.jpg" alt="" aria-hidden loading="lazy" className="h-full w-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/10" />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/etch.svg" alt="" aria-hidden className="close-etch pointer-events-none absolute left-1/2 top-[18%] w-[min(110vw,1100px)] -translate-x-1/2 opacity-[0.16] [filter:invert(21%)_sepia(93%)_saturate(4000%)_hue-rotate(348deg)_brightness(85%)]" />
      <div className="relative px-[var(--gutter)] pb-16 pt-40 md:pb-20">
        <p className="label mb-6">Last chapter</p>
        <h2 className="display text-[clamp(3.6rem,15vw,19rem)] text-bone">
          <span className="line-mask"><span>{content.closing.a}</span></span>
          <span className="line-mask"><span className="serif-it !normal-case text-signal">{content.closing.b}</span></span>
        </h2>
        <div className="close-cta mt-10 flex flex-wrap items-center gap-6">
          <Button href={JOIN_URL}>{content.closing.cta}</Button>
          <p className="body max-w-[30ch] !text-bone/70">One membership, £199.99 a year. Weekly rides, the app, and your hoody in the post on day 14.</p>
        </div>
      </div>
    </section>
  );
}

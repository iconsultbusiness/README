"use client";
import { useRef } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { content } from "@/lib/content";
import { Lines } from "./Reveal";

/** Horizontal strip of ride photography. Pinned and scrubbed on desktop, native snap scroll on touch. */
export function Rides() {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (prefersReducedMotion()) return;
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1024px)", () => {
      const t = track.current!;
      const dist = () => t.scrollWidth - window.innerWidth;
      const tween = gsap.to(t, {
        x: () => -dist(), ease: "none",
        scrollTrigger: { trigger: root.current, start: "top top", end: () => `+=${dist()}`, pin: true, scrub: 0.9, anticipatePin: 1, invalidateOnRefresh: true },
      });
      t.querySelectorAll<HTMLElement>(".frame img").forEach((img) => {
        gsap.fromTo(img, { xPercent: -8 }, { xPercent: 8, ease: "none", scrollTrigger: { trigger: img.parentElement, containerAnimation: tween, start: "left right", end: "right left", scrub: true } });
      });
      gsap.to(".rides-progress", { scaleX: 1, ease: "none", scrollTrigger: { trigger: root.current, start: "top top", end: () => `+=${dist()}`, scrub: true } });
    });
    return () => mm.revert();
  }, { scope: root });

  return (
    <section ref={root} id="rides" className="relative overflow-hidden bg-asphalt">
      <div className="flex items-end justify-between px-[var(--gutter)] pt-24 lg:absolute lg:inset-x-0 lg:top-0 lg:z-10 lg:pt-10">
        <div>
          <p className="label mb-3">Chapter 02 — From the rides</p>
          <Lines text="Every week. Every bike." as="h2" className="display text-[clamp(2.4rem,6vw,5rem)] text-bone" />
        </div>
        <p className="label hidden lg:block">Scroll to move</p>
      </div>
      <div
        ref={track}
        data-cursor="View"
        className="flex gap-[4vw] overflow-x-auto px-[var(--gutter)] py-14 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:h-[100svh] lg:items-center lg:overflow-visible lg:py-0 lg:pl-[var(--gutter)] lg:pr-[20vw] snap-x snap-mandatory lg:snap-none"
      >
        <div className="hidden w-[20vw] shrink-0 lg:block" />
        {content.rides.map((f, i) => (
          <figure key={f.title} className="group relative shrink-0 snap-start">
            <div className={`frame relative overflow-hidden ${i % 2 ? "aspect-[4/5] w-[72vw] md:w-[34vw] lg:w-[26vw]" : "aspect-[16/10] w-[82vw] md:w-[52vw] lg:w-[42vw]"} ${i % 2 ? "lg:-translate-y-[8vh]" : "lg:translate-y-[6vh]"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.img} alt={f.title} loading="lazy" className="h-full w-[120%] max-w-none object-cover transition-transform duration-[1200ms] [transition-timing-function:var(--ease-out-expo)] group-hover:scale-[1.04]" />
            </div>
            <figcaption className="mt-4 flex items-baseline justify-between gap-6">
              <span className="display-wide text-[1.1rem] text-bone">{f.title}</span>
              <span className="label">{f.meta}</span>
            </figcaption>
            <span className="serif-it absolute -left-3 -top-8 text-[3rem] text-steel lg:-left-6 lg:-top-12 lg:text-[5rem]">0{i + 1}</span>
          </figure>
        ))}
      </div>
      <div className="rides-progress absolute bottom-6 left-[var(--gutter)] right-[var(--gutter)] hidden h-px origin-left scale-x-0 bg-bone lg:block" />
    </section>
  );
}

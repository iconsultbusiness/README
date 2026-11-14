"use client";
import { useRef } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { content } from "@/lib/content";
import { Lines } from "./Reveal";

export function Films() {
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
      // inner parallax per poster
      t.querySelectorAll<HTMLElement>(".poster img").forEach((img) => {
        gsap.fromTo(img, { xPercent: -8 }, { xPercent: 8, ease: "none", scrollTrigger: { trigger: img.parentElement, containerAnimation: tween, start: "left right", end: "right left", scrub: true } });
      });
      gsap.to(".films-progress", { scaleX: 1, ease: "none", scrollTrigger: { trigger: root.current, start: "top top", end: () => `+=${dist()}`, scrub: true } });
    });
    return () => mm.revert();
  }, { scope: root });

  return (
    <section ref={root} id="films" className="relative overflow-hidden bg-asphalt">
      <div className="flex items-end justify-between px-[var(--gutter)] pt-24 lg:absolute lg:inset-x-0 lg:top-0 lg:z-10 lg:pt-10">
        <div>
          <p className="label mb-3">Chapter 02 — The films</p>
          <Lines text="Shot by riders." as="h2" className="display text-[clamp(2.4rem,6vw,5rem)] text-bone" />
        </div>
        <p className="label hidden lg:block">Scroll to move</p>
      </div>
      <div
        ref={track}
        data-cursor="Watch"
        className="flex gap-[4vw] overflow-x-auto px-[var(--gutter)] py-14 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:h-[100svh] lg:items-center lg:overflow-visible lg:py-0 lg:pl-[var(--gutter)] lg:pr-[20vw] snap-x snap-mandatory lg:snap-none"
      >
        <div className="hidden w-[20vw] shrink-0 lg:block" />
        {content.films.map((f, i) => (
          <a key={f.title} href="#" className="group poster relative shrink-0 snap-start" aria-label={`Watch ${f.title}`}>
            <div className={`relative overflow-hidden ${i % 2 ? "aspect-[4/5] w-[72vw] md:w-[34vw] lg:w-[26vw]" : "aspect-[16/10] w-[82vw] md:w-[52vw] lg:w-[42vw]"} ${i % 2 ? "lg:-translate-y-[8vh]" : "lg:translate-y-[6vh]"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.img} alt="" loading="lazy" className="h-full w-[120%] max-w-none object-cover transition-transform duration-[1200ms] [transition-timing-function:var(--ease-out-expo)] group-hover:scale-[1.04]" />
              <span className="absolute left-4 top-4 flex h-12 w-12 items-center justify-center rounded-full border border-bone/50 bg-ink/40 backdrop-blur transition-transform duration-700 group-hover:scale-110">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="ml-0.5 text-bone"><path d="M2 1l9 5-9 5z" /></svg>
              </span>
            </div>
            <div className="mt-4 flex items-baseline justify-between gap-6">
              <h3 className="display-wide text-[1.1rem] text-bone">{f.title}</h3>
              <span className="label">{f.meta}</span>
            </div>
            <span className="serif-it absolute -left-3 -top-8 text-[3rem] text-steel lg:-left-6 lg:-top-12 lg:text-[5rem]">0{i + 1}</span>
          </a>
        ))}
      </div>
      <div className="films-progress absolute bottom-6 left-[var(--gutter)] right-[var(--gutter)] hidden h-px origin-left scale-x-0 bg-bone lg:block" />
    </section>
  );
}

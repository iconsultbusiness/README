"use client";
import { useRef } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { content } from "@/lib/content";
import { ZoomImage, Lines } from "./Reveal";

/** Pinned visual on the left, copy beats change on the right. Stacked on mobile. */
export function Chapters() {
  const root = useRef<HTMLElement>(null);
  const items = content.chapters;

  useGSAP(() => {
    if (prefersReducedMotion()) return;
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1024px)", () => {
      const q = gsap.utils.selector(root);
      const imgs = q(".ch-img");
      const beats = q(".ch-beat");
      const n = items.length;
      gsap.set(imgs, { clipPath: "inset(0 0 100% 0)" });
      gsap.set(imgs[0], { clipPath: "inset(0 0 0% 0)" });
      gsap.set(beats, { opacity: 0.18 });
      gsap.set(beats[0], { opacity: 1 });

      const tl = gsap.timeline({
        scrollTrigger: { trigger: root.current, start: "top top", end: `+=${n * 90}%`, pin: true, scrub: 0.8, anticipatePin: 1 },
      });
      for (let i = 1; i < n; i++) {
        tl.to(imgs[i], { clipPath: "inset(0 0 0% 0)", duration: 1, ease: "power3.inOut" }, i)
          .fromTo(imgs[i].querySelector("img"), { scale: 1.18 }, { scale: 1, duration: 1.4, ease: "power2.out" }, i)
          .to(beats[i - 1], { opacity: 0.18, duration: 0.5 }, i)
          .to(beats[i], { opacity: 1, duration: 0.5 }, i + 0.2)
          .to(q(".ch-counter"), { yPercent: -(100 / n) * i, duration: 1, ease: "power3.inOut" }, i);
      }
      tl.to({}, { duration: 0.6 });
    });
    return () => mm.revert();
  }, { scope: root });

  return (
    <section ref={root} id="chapters" className="relative bg-ink">
      {/* desktop */}
      <div className="hidden h-[100svh] grid-cols-12 gap-[var(--gutter)] px-[var(--gutter)] lg:grid">
        <div className="relative col-span-6 self-center">
          <div className="relative aspect-[4/5] w-full max-h-[80svh] overflow-hidden">
            {items.map((c, i) => (
              <div key={c.title} className="ch-img absolute inset-0 overflow-hidden" style={{ zIndex: i }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.img} alt="" className="h-full w-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute -left-4 top-6 flex items-start gap-3">
            <span className="label !text-bone">Chapter</span>
            <span className="relative block h-[1.1em] overflow-hidden text-[0.6875rem] leading-[1.1em] font-medium tracking-[0.22em] text-bone">
              <span className="ch-counter block">
                {items.map((c) => <span key={c.n} className="block">{c.n}</span>)}
              </span>
            </span>
          </div>
        </div>
        <div className="col-span-5 col-start-8 flex flex-col justify-center gap-12">
          <p className="label">How it works</p>
          {items.map((c) => (
            <div key={c.title} className="ch-beat">
              <div className="flex items-baseline gap-5">
                <span className="serif-it text-[1.4rem] text-signal">{c.n}</span>
                <h3 className="display text-[clamp(3rem,6vw,6.5rem)] text-bone">{c.title}</h3>
              </div>
              <p className="body mt-3 max-w-[34ch]">{c.line}</p>
            </div>
          ))}
        </div>
      </div>

      {/* mobile / tablet */}
      <div className="flex flex-col gap-20 px-[var(--gutter)] py-24 lg:hidden">
        <p className="label">How it works</p>
        {items.map((c, i) => (
          <article key={c.title} className={`grid gap-6 ${i % 2 ? "md:grid-cols-[1fr_1.2fr]" : "md:grid-cols-[1.2fr_1fr]"}`}>
            <ZoomImage src={c.img} alt="" className={`${i % 2 ? "md:order-2" : ""} aspect-[4/5] w-[86%] ${i % 2 ? "ml-auto" : ""}`} />
            <div className="self-end">
              <span className="serif-it text-[1.3rem] text-signal">{c.n}</span>
              <Lines text={c.title} as="h3" className="display mt-2 text-[clamp(3rem,13vw,6rem)] text-bone" />
              <p className="body mt-4">{c.line}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

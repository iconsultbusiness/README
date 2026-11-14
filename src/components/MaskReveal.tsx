"use client";
import { useRef } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";

/** Film frame revealed through the wings silhouette, which opens up as you scroll. */
export function MaskReveal() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const q = gsap.utils.selector(root);
    if (prefersReducedMotion()) { gsap.set(q(".masked"), { maskSize: "400% auto", webkitMaskSize: "400% auto" }); return; }
    const mm = gsap.matchMedia();
    mm.add("(min-width: 768px)", () => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: root.current, start: "top top", end: "+=220%", pin: true, scrub: 0.8, anticipatePin: 1 },
      });
      tl.fromTo(q(".masked"), { "--m": 34 }, { "--m": 560, ease: "power2.in", duration: 1 }, 0)
        .fromTo(q(".masked img"), { scale: 1.25 }, { scale: 1, ease: "none", duration: 1 }, 0)
        .fromTo(q(".cap-a"), { opacity: 1 }, { opacity: 0, duration: 0.25 }, 0.3)
        .fromTo(q(".cap-b .line-mask > span"), { yPercent: 110 }, { yPercent: 0, stagger: 0.08, duration: 0.3 }, 0.65);
    });
    mm.add("(max-width: 767px)", () => {
      gsap.fromTo(q(".masked"), { "--m": 60 }, { "--m": 560, ease: "power2.in", scrollTrigger: { trigger: root.current, start: "top 60%", end: "bottom 60%", scrub: 0.8 } });
      gsap.set(q(".cap-b .line-mask > span"), { yPercent: 0 });
    });
    return () => mm.revert();
  }, { scope: root });

  return (
    <section ref={root} className="relative h-[100svh] overflow-hidden bg-ink">
      <div
        className="masked absolute inset-0 [--m:34] [mask-image:url('/brand/silhouette.svg')] [mask-position:center_46%] [mask-repeat:no-repeat] [mask-size:calc(var(--m)*1%)_auto] [-webkit-mask-image:url('/brand/silhouette.svg')] [-webkit-mask-position:center_46%] [-webkit-mask-repeat:no-repeat] [-webkit-mask-size:calc(var(--m)*1%)_auto]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/media/rally.jpg" alt="Riders on an empty road at dusk" className="h-full w-full object-cover will-change-transform" loading="lazy" />
      </div>
      <div className="cap-a pointer-events-none absolute inset-x-0 bottom-[12%] hidden justify-between px-[var(--gutter)] md:flex">
        <span className="label">Keep scrolling</span>
        <span className="label">Through the lion</span>
      </div>
      <div className="cap-b absolute bottom-10 left-[var(--gutter)] right-[var(--gutter)] md:bottom-14">
        <p className="label mb-4">Chapter 01 — The road</p>
        <h2 className="display text-[length:var(--d2)] text-bone">
          <span className="line-mask"><span>Built on</span></span>
          <span className="line-mask"><span>the road<span className="text-signal">.</span></span></span>
        </h2>
      </div>
    </section>
  );
}

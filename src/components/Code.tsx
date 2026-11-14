"use client";
import { useRef } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { content } from "@/lib/content";

const themes: Record<string, string> = {
  ink: "bg-ink text-bone",
  oxblood: "bg-oxblood text-bone",
  bone: "bg-bone text-ink",
};

/** Three full-screen panels that stack over one another. */
export function Code() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    const panels = gsap.utils.toArray<HTMLElement>(".code-panel", root.current!);
    panels.forEach((p, i) => {
      const inner = p.querySelector(".code-inner");
      const next = panels[i + 1];
      // as the next panel wipes up over this one, drift this copy up and dim it
      if (next) gsap.fromTo(inner, { yPercent: 0, opacity: 1 }, { yPercent: -24, opacity: 0.3, ease: "none", scrollTrigger: { trigger: next, start: "top bottom", end: "top top", scrub: true } });
      gsap.from(p.querySelectorAll(".line-mask > span"), { yPercent: 110, stagger: 0.1, duration: 1.2, scrollTrigger: { trigger: p, start: "top 60%", once: true } });
    });
  }, { scope: root });

  return (
    <section ref={root} id="code" className="relative">
      {content.code.map((c, i) => (
        <div key={c.n} className={`code-panel sticky top-0 flex h-[100svh] flex-col justify-between px-[var(--gutter)] py-10 ${themes[c.theme]}`} style={{ zIndex: i + 1 }}>
          <div className="flex items-start justify-between">
            <p className="label !text-current opacity-70">The code — {c.n}</p>
            {i === 0 && <p className="label !text-current opacity-70">Chapter 03</p>}
          </div>
          <div className="code-inner">
            <h2 className="display text-[clamp(3.2rem,12vw,13rem)]">
              {c.title.split(" ").map((w, j, arr) => (
                <span key={j} className="line-mask md:inline-block md:overflow-visible md:p-0 md:m-0">
                  <span>{w}{j < arr.length - 1 ? " " : ""}</span>
                </span>
              ))}
            </h2>
            <p className="body mt-6 !text-current opacity-80">{c.body}</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/etch.svg" alt="" aria-hidden className={`pointer-events-none absolute right-[-10%] top-1/2 w-[60vw] -translate-y-1/2 opacity-[0.07] ${c.theme === "bone" ? "" : "[filter:invert(1)]"}`} />
        </div>
      ))}
    </section>
  );
}

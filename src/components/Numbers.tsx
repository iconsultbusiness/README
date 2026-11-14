"use client";
import { useRef } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { content } from "@/lib/content";

const fmt = (n: number) => n.toLocaleString("en-GB");

export function Numbers() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const els = root.current!.querySelectorAll<HTMLElement>(".num");
    els.forEach((el) => {
      const target = Number(el.dataset.value);
      if (prefersReducedMotion()) { el.textContent = fmt(target); return; }
      const o = { v: 0 };
      gsap.to(o, { v: target, duration: 2.2, ease: "power3.out", onUpdate: () => (el.textContent = fmt(Math.round(o.v))), scrollTrigger: { trigger: el, start: "top 85%", once: true } });
    });
    gsap.from(root.current!.querySelectorAll(".num-row"), { opacity: 0, y: 30, stagger: 0.12, duration: 1.2, scrollTrigger: { trigger: root.current, start: "top 75%", once: true } });
  }, { scope: root });

  return (
    <section ref={root} className="relative bg-ink px-[var(--gutter)] py-28 md:py-40">
      <p className="label mb-12">By the numbers</p>
      <div className="divide-y divide-steel border-y border-steel">
        {content.numbers.map((n, i) => (
          <div key={n.label} className="num-row grid grid-cols-[auto_1fr] items-baseline gap-x-6 py-6 md:grid-cols-[6rem_1fr_auto] md:py-8">
            <span className="serif-it text-[1.2rem] text-signal">0{i + 1}</span>
            <span className="display text-[clamp(3.4rem,11vw,12rem)] tabular-nums text-bone">
              <span className="num" data-value={n.value}>0</span>{n.suffix}
            </span>
            <span className="label col-span-2 md:col-span-1 md:text-right">{n.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

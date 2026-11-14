"use client";
import { useRef } from "react";
import { gsap, useGSAP, JOIN_URL, prefersReducedMotion } from "@/lib/gsap";
import { content } from "@/lib/content";
import { Lines, Fade } from "./Reveal";
import { Button } from "./Magnetic";

export function Membership() {
  const root = useRef<HTMLElement>(null);
  const m = content.membership;

  useGSAP(() => {
    const els = root.current!.querySelectorAll<HTMLElement>(".count");
    els.forEach((el) => {
      const target = Number(el.dataset.value);
      if (prefersReducedMotion()) { el.textContent = String(target); return; }
      const o = { v: 0 };
      gsap.to(o, { v: target, duration: 1.8, ease: "power3.out", onUpdate: () => (el.textContent = String(Math.round(o.v))), scrollTrigger: { trigger: el, start: "top 85%", once: true } });
    });
    if (prefersReducedMotion()) return;
    gsap.from(root.current!.querySelectorAll(".inc"), { opacity: 0, x: -16, stagger: 0.08, duration: 0.9, scrollTrigger: { trigger: ".inc-list", start: "top 80%", once: true } });
    gsap.from(root.current!.querySelectorAll(".step"), { opacity: 0, y: 24, stagger: 0.12, duration: 1, scrollTrigger: { trigger: ".steps", start: "top 80%", once: true } });
  }, { scope: root });

  return (
    <section ref={root} id="membership" className="relative bg-ink px-[var(--gutter)] py-28 md:py-40">
      <div className="grid gap-16 md:grid-cols-12">
        <div className="md:col-span-7">
          <p className="label mb-4">Chapter 03 — Membership</p>
          <Lines text={"One membership.\nEvery ride."} as="h2" className="display text-[clamp(3rem,8.5vw,9rem)] text-bone" />
          <div className="mt-10 flex flex-wrap items-baseline gap-x-5 gap-y-2">
            <span className="display text-[clamp(4rem,12vw,13rem)] tabular-nums text-bone">{m.price}</span>
            <span className="serif-it text-[clamp(1.6rem,3vw,3rem)] text-signal">{m.per}</span>
          </div>
          <p className="body mt-4">Joining a new sector? The first ten members get the founding offer: <span className="text-bone">{m.founding}</span>.</p>
          <div className="mt-10"><Button href={JOIN_URL}>Join the ride</Button></div>
        </div>

        <ul className="inc-list md:col-span-4 md:col-start-9 md:self-end">
          {m.includes.map((line, i) => (
            <li key={line} className="inc flex gap-5 border-t border-steel py-5 last:border-b">
              <span className="serif-it text-[1.1rem] text-signal">0{i + 1}</span>
              <span className="text-[1.05rem] leading-snug text-bone">{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="steps mt-28 grid gap-10 border-t border-steel pt-12 md:grid-cols-3 md:gap-[var(--gutter)]">
        {m.steps.map((s) => (
          <div key={s.n} className="step">
            <span className="serif-it text-[2rem] text-signal">{s.n}</span>
            <h3 className="display mt-2 text-[clamp(2rem,3.6vw,3.6rem)] text-bone">{s.title}</h3>
            <p className="body mt-3">{s.line}</p>
          </div>
        ))}
      </div>

      <Fade className="mt-24 grid grid-cols-2 gap-8 md:grid-cols-4">
        {content.numbers.map((n) => (
          <div key={n.label}>
            <span className="display block text-[clamp(3rem,7vw,7rem)] tabular-nums text-bone"><span className="count" data-value={n.value}>0</span>{n.suffix}</span>
            <span className="label mt-2 block">{n.label}</span>
          </div>
        ))}
      </Fade>
    </section>
  );
}

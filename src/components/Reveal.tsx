"use client";
import { useRef } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";

/** Renders each line (split on "\n") inside an overflow mask and slides it up on enter. */
export function Lines({ text, className = "", as: Tag = "h2", delay = 0, serifWords = [] as string[], start = "top 85%" }: {
  text: string; className?: string; as?: React.ElementType; delay?: number; serifWords?: string[]; start?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useGSAP(() => {
    const spans = ref.current!.querySelectorAll(".line-mask > span");
    if (prefersReducedMotion()) { gsap.set(spans, { yPercent: 0 }); return; }
    gsap.fromTo(spans, { yPercent: 110 }, {
      yPercent: 0, duration: 1.2, stagger: 0.09, delay,
      scrollTrigger: { trigger: ref.current, start, once: true },
    });
  }, { scope: ref });
  return (
    <Tag ref={ref} className={className}>
      {text.split("\n").map((line, i) => (
        <span className="line-mask" key={i}>
          <span>
            {line.split(" ").map((w, j) => {
              const clean = w.replace(/[^\w']/g, "");
              const serif = serifWords.includes(clean);
              return <span key={j} className={serif ? "serif-it" : undefined}>{w}{" "}</span>;
            })}
          </span>
        </span>
      ))}
    </Tag>
  );
}

/** Fades/lifts a block on enter. */
export function Fade({ children, className = "", delay = 0, y = 24 }: { children: React.ReactNode; className?: string; delay?: number; y?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    gsap.from(ref.current, { opacity: 0, y, duration: 1.1, delay, scrollTrigger: { trigger: ref.current, start: "top 88%", once: true } });
  }, { scope: ref });
  return <div ref={ref} className={className}>{children}</div>;
}

/** Image that zooms subtly as it scrolls through the viewport. */
export function ZoomImage({ src, alt, className = "", imgClassName = "", from = 1.14, sizes = "100vw", priority = false }: {
  src: string; alt: string; className?: string; imgClassName?: string; from?: number; sizes?: string; priority?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    gsap.fromTo(ref.current!.querySelector("img"), { scale: from }, {
      scale: 1, ease: "none",
      scrollTrigger: { trigger: ref.current, start: "top bottom", end: "bottom top", scrub: 0.8 },
    });
  }, { scope: ref });
  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} sizes={sizes} loading={priority ? "eager" : "lazy"} decoding="async" className={`h-full w-full object-cover will-change-transform ${imgClassName}`} />
    </div>
  );
}

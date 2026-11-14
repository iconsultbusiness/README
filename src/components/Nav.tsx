"use client";
import { useEffect, useRef, useState } from "react";
import { gsap, useGSAP, JOIN_URL } from "@/lib/gsap";
import { Magnetic } from "./Magnetic";

const links = [
  { label: "Rides", href: "#chapters" },
  { label: "Membership", href: "#membership" },
  { label: "The Code", href: "#code" },
  { label: "Voices", href: "#voices" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const bar = useRef<HTMLElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);

  // hide on scroll down, show on scroll up
  useGSAP(() => {
    let last = 0;
    const el = bar.current!;
    const onScroll = () => {
      const y = window.scrollY;
      const down = y > last && y > 120;
      gsap.to(el, { yPercent: down ? -110 : 0, duration: 0.6, overwrite: true });
      el.classList.toggle("backdrop", y > 40);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  });

  useGSAP(() => {
    const o = overlay.current!;
    tl.current = gsap
      .timeline({ paused: true })
      .set(o, { pointerEvents: "auto" })
      .to(o, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.9, ease: "expo.inOut" })
      .from(o.querySelectorAll(".ov-line > span"), { yPercent: 110, stagger: 0.07, duration: 0.9 }, "-=0.4")
      .from(o.querySelectorAll(".ov-meta"), { opacity: 0, y: 10, stagger: 0.08, duration: 0.6 }, "-=0.6");
  }, { scope: overlay });

  useEffect(() => {
    const t = tl.current; if (!t) return;
    const lenis = (window as unknown as { lenis?: { stop: () => void; start: () => void } }).lenis;
    if (open) { t.timeScale(1).play(); lenis?.stop(); document.body.style.overflow = "hidden"; }
    else { t.timeScale(1.6).reverse(); lenis?.start(); document.body.style.overflow = ""; }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header ref={bar} className="fixed inset-x-0 top-0 z-[70] transition-colors [&.backdrop]:bg-ink/60 [&.backdrop]:backdrop-blur-md">
        <div className="flex items-center justify-between px-[var(--gutter)] py-5">
          <a href="#top" className="display-wide text-[0.95rem] tracking-[0.02em] text-bone" aria-label="Bike Culture home">
            Bike<span className="text-signal">·</span>Culture
          </a>
          <nav className="hidden items-center gap-10 lg:flex" aria-label="Primary">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="ul label !text-bone/80 hover:!text-bone">{l.label}</a>
            ))}
            <Magnetic strength={0.25}>
              <a href={JOIN_URL} target="_blank" rel="noopener noreferrer" className="btn !h-11 !px-5 !text-sm">
                <span className="btn-label"><span>Join the ride<br />Join the ride</span></span>
              </a>
            </Magnetic>
          </nav>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="menu"
            className="label flex items-center gap-3 !text-bone lg:hidden"
          >
            <span>{open ? "Close" : "Menu"}</span>
            <span className="relative block h-3 w-6">
              <span className={`absolute left-0 top-0 h-px w-full bg-bone transition-transform duration-500 ${open ? "translate-y-[5.5px] rotate-45" : ""}`} />
              <span className={`absolute bottom-0 left-0 h-px w-full bg-bone transition-transform duration-500 ${open ? "-translate-y-[5.5px] -rotate-45" : ""}`} />
            </span>
          </button>
        </div>
      </header>

      <div
        id="menu"
        ref={overlay}
        className="pointer-events-none fixed inset-0 z-[65] flex flex-col justify-between bg-asphalt px-[var(--gutter)] pb-10 pt-28 [clip-path:inset(0%_0%_100%_0%)]"
        aria-hidden={!open}
      >
        <img src="/brand/etch.svg" alt="" aria-hidden className="pointer-events-none absolute -right-[20%] top-1/2 w-[120vw] max-w-none -translate-y-1/2 opacity-[0.08] [filter:invert(1)]" />
        <nav className="relative flex flex-col gap-2" aria-label="Menu">
          {links.map((l, i) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="ov-line line-mask display text-[clamp(3rem,13vw,6rem)] text-bone">
              <span><span className="serif-it mr-4 align-top text-[0.35em] text-signal">0{i + 1}</span>{l.label}</span>
            </a>
          ))}
        </nav>
        <div className="relative flex flex-col gap-6">
          <a href={JOIN_URL} target="_blank" rel="noopener noreferrer" className="ov-meta btn w-fit">
            <span className="btn-label"><span>Join the ride<br />Join the ride</span></span>
          </a>
          <div className="ov-meta flex gap-6 label">
            <a className="ul" href="https://instagram.com" target="_blank" rel="noopener noreferrer">Instagram</a>
            <a className="ul" href="https://youtube.com" target="_blank" rel="noopener noreferrer">YouTube</a>
            <a className="ul" href="https://tiktok.com" target="_blank" rel="noopener noreferrer">TikTok</a>
          </div>
        </div>
      </div>
    </>
  );
}

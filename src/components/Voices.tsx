"use client";
import { content } from "@/lib/content";
import { Lines, ZoomImage, Fade } from "./Reveal";

export function Voices() {
  const row = [...content.voices, ...content.voices];
  return (
    <section id="voices" className="relative overflow-hidden bg-ink py-28 md:py-40">
      <div className="px-[var(--gutter)]">
        <p className="label mb-3">Chapter 04 — Voices</p>
        <Lines text="From the pack." as="h2" className="display text-[clamp(2.4rem,6vw,5rem)] text-bone" />
      </div>

      <div className="mt-16 flex flex-col gap-4 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
        <div className="marquee [--marquee-dur:70s]">
          {row.map((v, i) => (
            <span key={i} className="display-wide mx-6 whitespace-nowrap text-[clamp(1.6rem,3.6vw,3.2rem)] text-chrome/70">
              “{v.q}” <span className="serif-it text-signal">{v.who}</span>
            </span>
          ))}
        </div>
        <div className="marquee [--marquee-dur:90s] [animation-direction:reverse]">
          {row.slice().reverse().map((v, i) => (
            <span key={i} className="display-wide mx-6 whitespace-nowrap text-[clamp(1.6rem,3.6vw,3.2rem)] text-steel">
              “{v.q}” <span className="serif-it text-chrome">{v.who}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-28 grid gap-10 px-[var(--gutter)] md:mt-40 md:grid-cols-12 md:items-end">
        <ZoomImage src="/media/forecourt.jpg" alt="Riders beside their bikes on a petrol forecourt at night" className="aspect-[4/5] md:col-span-4" />
        <Fade className="md:col-span-7 md:col-start-6">
          <blockquote>
            <p className="serif-it text-[clamp(2rem,5vw,4.8rem)] leading-[1.02] text-bone">“{content.pull.q}”</p>
            <footer className="label mt-8">— {content.pull.who}</footer>
          </blockquote>
        </Fade>
      </div>
    </section>
  );
}

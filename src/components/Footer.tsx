import { JOIN_URL } from "@/lib/gsap";

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-ink px-[var(--gutter)] pt-16">
      <div className="grid gap-10 border-t border-steel pt-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="display-wide text-[1rem] text-bone">Bike<span className="text-signal">·</span>Culture</p>
          <p className="body mt-3 max-w-[30ch]">A riders&rsquo; collective. One pride, every road.</p>
        </div>
        <ul className="flex flex-col gap-3 label">
          <li><a className="ul" href="#chapters">Rideouts</a></li>
          <li><a className="ul" href="#films">Films</a></li>
          <li><a className="ul" href="#code">The Code</a></li>
          <li><a className="ul" href={JOIN_URL} target="_blank" rel="noopener noreferrer">Join</a></li>
        </ul>
        <ul className="flex flex-col gap-3 label">
          <li><a className="ul" href="https://instagram.com" target="_blank" rel="noopener noreferrer">Instagram</a></li>
          <li><a className="ul" href="https://youtube.com" target="_blank" rel="noopener noreferrer">YouTube</a></li>
          <li><a className="ul" href="https://tiktok.com" target="_blank" rel="noopener noreferrer">TikTok</a></li>
          <li><a className="ul" href="mailto:hello@bikeculture.co">hello@bikeculture.co</a></li>
        </ul>
      </div>
      <div className="mt-10 flex flex-wrap justify-between gap-4 label !text-steel">
        <span>&copy; {new Date().getFullYear()} Bike Culture</span>
        <span>Ride safe. Ride together.</span>
      </div>
      <div aria-hidden className="display pointer-events-none mt-6 -mb-[0.18em] select-none whitespace-nowrap text-center text-[clamp(5rem,19.5vw,26rem)] leading-[0.8] text-asphalt">
        Bike Culture
      </div>
    </footer>
  );
}

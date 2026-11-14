import { Nav } from "@/components/Nav";
import { Preloader } from "@/components/Preloader";
import { Hero } from "@/components/Hero";
import { Manifesto } from "@/components/Manifesto";
import { MaskReveal } from "@/components/MaskReveal";
import { Chapters } from "@/components/Chapters";
import { Rides } from "@/components/Rides";
import { Membership } from "@/components/Membership";
import { Code } from "@/components/Code";
import { Voices } from "@/components/Voices";
import { Closing } from "@/components/Closing";
import { Footer } from "@/components/Footer";

export default function Page() {
  return (
    <>
      <Preloader />
      <Nav />
      <main>
        <Hero />
        <Manifesto />
        <MaskReveal />
        <Chapters />
        <Rides />
        <Membership />
        <Code />
        <Voices />
        <Closing />
      </main>
      <Footer />
    </>
  );
}

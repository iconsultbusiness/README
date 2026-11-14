import { Nav } from "@/components/Nav";
import { Preloader } from "@/components/Preloader";
import { Hero } from "@/components/Hero";
import { Manifesto } from "@/components/Manifesto";
import { MaskReveal } from "@/components/MaskReveal";
import { Chapters } from "@/components/Chapters";
import { Films } from "@/components/Films";
import { Numbers } from "@/components/Numbers";
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
        <Films />
        <Numbers />
        <Code />
        <Voices />
        <Closing />
      </main>
      <Footer />
    </>
  );
}

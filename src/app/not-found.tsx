import { DestinationArt } from "@/components/art/destination-art";
import { Container, LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <Container className="grid items-center gap-10 py-20 md:grid-cols-2">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-terracotta-700">404</p>
        <h1 className="mt-3 text-5xl text-forest">Off the map</h1>
        <p className="mt-4 text-lg text-ink-muted">We couldn&apos;t find that page — or you don&apos;t have access to it.</p>
        <div className="mt-8 flex gap-3"><LinkButton href="/">Go home</LinkButton><LinkButton href="/destinations" variant="secondary">Explore destinations</LinkButton></div>
      </div>
      <div className="aspect-[4/3] overflow-hidden rounded-[var(--radius-card)]"><DestinationArt variant="desert" seed="404" /></div>
    </Container>
  );
}

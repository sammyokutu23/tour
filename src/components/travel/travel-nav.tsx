import Link from "next/link";
import { Container } from "@/components/ui";

const LINKS = [
  { href: "/travel-together", label: "Discover" },
  { href: "/travel-together/my-groups", label: "My groups" },
  { href: "/travel-together/requests", label: "Requests & invites" },
  { href: "/travel-together/messages", label: "Group chats" },
  { href: "/travel-together/profile", label: "Travel profile" },
  { href: "/travel-together/guidelines", label: "Safety & guidelines" },
];

export function TravelNav() {
  return (
    <div className="border-b border-sand-300/70 bg-white">
      <Container className="flex items-center gap-1 overflow-x-auto py-2">
        <nav aria-label="Travel Together" className="flex gap-1">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold text-ink-muted hover:bg-forest-50 hover:text-forest">
              {l.label}
            </Link>
          ))}
        </nav>
        <Link href="/travel-together/create" className="ml-auto whitespace-nowrap rounded-full bg-forest px-4 py-2 text-sm font-semibold text-sand hover:bg-forest-700">
          Create a group
        </Link>
      </Container>
    </div>
  );
}

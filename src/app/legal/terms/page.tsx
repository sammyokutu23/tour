import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Terms and conditions", alternates: { canonical: "/legal/terms" } };

export default function TermsPage() {
  return (
    <LegalPage title="Terms and conditions">
      <p>These terms explain how {brand.name} (“we”, “the platform”) works for travellers and providers.</p>
      <h2>1. What we do</h2>
      <p>We operate a marketplace that lets travellers plan itineraries and book services offered by independent guides and experience operators (“providers”). Providers deliver the services and are responsible for them, including holding any licences and permits their activities require.</p>
      <h2>2. Itineraries, quotes and bookings</h2>
      <ul>
        <li>Draft itineraries and quotes do not reserve anything.</li>
        <li>A booking request holds availability for a limited time while providers decide whether to accept.</li>
        <li>A booking is confirmed only after all providers accept and your payment is verified by the payment provider.</li>
        <li>The price, inclusions and cancellation terms shown when you request a booking are recorded and apply to that booking.</li>
      </ul>
      <h2>3. Prices and fees</h2>
      <p>Prices are shown in Kenyan shillings and include a traveller service fee shown separately in the breakdown. Park, conservancy and other third-party fees are not included unless stated.</p>
      <h2>4. Cancellations and refunds</h2>
      <p>See the <a href="/legal/cancellation" className="underline">Cancellation and refund policy</a>.</p>
      <h2>5. Provider obligations</h2>
      <p>Providers must give accurate information, keep availability up to date, honour accepted bookings and comply with applicable law. We may suspend profiles or listings, with documented reasons, where these obligations aren&apos;t met.</p>
      <h2>6. Reviews and conduct</h2>
      <p>Reviews must reflect genuine experiences from completed bookings. Harassment, discrimination, fraud and attempts to take payments off-platform are not allowed.</p>
      <h2>7. Liability</h2>
      <p>[To be drafted with counsel.]</p>
      <h2>8. Contact</h2>
      <p>Questions about these terms can be sent through our contact page.</p>
    </LegalPage>
  );
}

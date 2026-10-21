import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";
import { POLICY_SUMMARY } from "@/domain/cancellation";

export const metadata: Metadata = { title: "Cancellation and refund policy", alternates: { canonical: "/legal/cancellation" } };

export default function CancellationPage() {
  return (
    <LegalPage title="Cancellation and refund policy">
      <p>Each experience and guide service shows one of three policies before you book. The policy recorded with your booking is the one that applies.</p>
      <h2>Policies</h2>
      <ul>
        <li><strong>Flexible:</strong> {POLICY_SUMMARY.flexible}</li>
        <li><strong>Moderate:</strong> {POLICY_SUMMARY.moderate}</li>
        <li><strong>Strict:</strong> {POLICY_SUMMARY.strict}</li>
      </ul>
      <p>Timing is measured from the scheduled start of each item. The service fee is refunded in the same proportion as the services it relates to.</p>
      <h2>If a provider cancels</h2>
      <p>You receive a full refund for that provider&apos;s services, including the related share of fees.</p>
      <h2>Before you pay</h2>
      <p>Cancelling a request that hasn&apos;t been paid costs nothing.</p>
      <h2>How refunds are paid</h2>
      <p>Refunds go back to the original payment method. Card and sandbox refunds are processed automatically; M-Pesa reversals are processed by our finance team. Your booking page shows the status of every refund.</p>
      <h2>Disputes</h2>
      <p>If you disagree with an outcome, open a dispute from the contact page and an administrator will review it.</p>
    </LegalPage>
  );
}

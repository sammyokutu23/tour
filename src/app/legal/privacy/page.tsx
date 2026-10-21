import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Privacy policy", alternates: { canonical: "/legal/privacy" } };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>This explains what personal data {brand.name} collects, why, and the choices you have.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account details: name, email, password (stored only as a secure hash), and optional phone and home country.</li>
        <li>Trip and booking details, including requirements you choose to share (such as dietary or accessibility needs).</li>
        <li>Messages you send on the platform.</li>
        <li>For providers: profile information and verification documents, stored in private storage and viewable only by you and authorised reviewers.</li>
        <li>Payment records (amount, status, provider reference). We do not receive or store card numbers or M-Pesa PINs.</li>
        <li>Product usage events; linked to your account only if you opt in.</li>
      </ul>
      <h2>How we use it</h2>
      <p>To run your bookings, process payments, prevent fraud and double bookings, provide support, and — with your consent — improve the service and send marketing.</p>
      <h2>Who we share it with</h2>
      <p>The providers you book (first name, party size and requirements you&apos;ve shared), payment and email service providers acting on our behalf, and authorities where legally required.</p>
      <h2>Your rights</h2>
      <p>You can access and download your data from Settings, update it, withdraw optional consents, and ask us to delete your account. Some booking and payment records must be kept for legal and accounting purposes.</p>
      <h2>Retention</h2>
      <p>[Retention periods to be defined with counsel and finance.]</p>
      <h2>Contact</h2>
      <p>Use the contact page for privacy requests. [Data protection officer contact and registration details with the Office of the Data Protection Commissioner to be added.]</p>
    </LegalPage>
  );
}

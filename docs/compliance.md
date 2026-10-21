# Compliance research notes (Kenya)

> **Not legal advice.** These notes are from preliminary desk research (October 2026) and secondary sources. Every item must be confirmed with qualified Kenyan counsel and the relevant authorities before launch. Nothing in the product claims legal compliance.

## Tourism licensing

- The **Tourism Act, 2011** establishes the **Tourism Regulatory Authority (TRA)**. Secondary sources say that tourism activities listed in the Act's schedules, including tour operators, travel agencies and individual professionals such as tour guides, require a TRA licence, with annual applications and renewals. *To verify:* the licence classes that apply to (a) the platform itself as an intermediary, (b) individual guides, (c) operators, and (d) community hosts.
- The TRA has recently revoked licences and announced crackdowns on unlicensed operators and guides. The platform should therefore record licence numbers and expiry dates (`provider_verifications.reference_number` / `expires_at` already support this), and should block or flag expired credentials.
- Tourist service vehicles: the NTSA (Operation of Tourist Service Vehicles) Regulations, 2015 reportedly require a valid TRA tour operator licence plus driver documents. This is relevant if listings include transport.
- **Guide certification:** the Kenya Professional Safari Guides Association (KPSGA) runs voluntary Bronze, Silver and Gold certification. It is a useful credential to record (`guide_certification`), but it is not a licence.
- Park and conservancy fees are set by KWS, counties and conservancies; listings must state whether they're included (the `exclusions` field).

## Data protection

- The **Data Protection Act, 2019** and its regulations require data controllers and processors to **register with the Office of the Data Protection Commissioner (ODPC)**. Registration certificates reportedly last two years, and hospitality appears in sector guidance on mandatory registration.
- Breaches must reportedly be notified to the ODPC within **72 hours**.
- Other duties: a lawful basis per processing activity, data-subject rights (access/export is implemented, deletion is via support), conditions for cross-border transfers (relevant for hosting, email and AI providers outside Kenya), and DPIAs for high-risk processing (identity documents qualify).

## Payments & consumer protection

- M-Pesa use is governed by Safaricom's Daraja terms and the merchant agreement. Holding traveller funds before paying providers may raise **payment-service / escrow** questions under the National Payment System Act; confirm with counsel and the payment partner.
- Under the Consumer Protection Act, 2012, cancellation and refund terms must be clear before purchase (they are shown on each listing and recorded per booking).

## Sources consulted

- People Daily: [TRA opens 2026 licence applications and renewals](https://peopledaily.digital/news/tourism-regulatory-authority-opens-2026-licence-applications-and-renewals/amp)
- Kenyans.co.ke: [TRA revokes licences of four tour firms](https://www.kenyans.co.ke/news/116019-tourism-regulatory-authority-revokes-licences-four-tour-firms-amid-crackdown-rogue?page=9)
- Achi Systems: [Requirements for TRA licence in Kenya](https://achisystems.co.ke/directory/requirements-for-tra-license-in-kenya/) (secondary)
- Kenya Law: [NTSA (Operation of Tourist Service Vehicles) Regulations, 2015](https://new.kenyalaw.org/akn/ke/act/ln/2015/20/eng@2022-12-31)
- ODPC: [FAQs](https://www.odpc.go.ke/faqs/) and [Data controllers compliance requirements](https://www.odpc.go.ke/wp-content/uploads/2025/07/Data-Controllers-360-Degrees-Compliance-Requirements.-Z-Card.pdf)
- Bowmans: [Kenya data protection — getting ready for registration](https://bowmanslaw.com/insights/kenya-data-protection-getting-ready-for-registration/)
- Duma Explorer: [Safari guide qualifications (KPSGA)](https://www.dumaexplorer.com/blog/safari-guide-qualifications-fgasa-kpsga-tala-wfr) (secondary)

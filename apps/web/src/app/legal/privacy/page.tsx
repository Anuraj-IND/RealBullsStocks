export const metadata = {
  title: "Privacy Policy",
  description: "How Realbulls collects, uses and protects your personal data.",
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>Last updated: {new Date().toLocaleDateString("en-GB")}</p>

      <p>
        Realbulls ("we", "us") operates a virtual trading simulation platform. This policy explains what personal data we
        collect, why, and your rights. Realbulls is a paper-trading environment: no real orders are placed with any
        exchange and no real funds move through the platform.
      </p>

      <h2>1. Data we collect</h2>
      <ul>
        <li>Account data: name, user ID, email address, password hash, role and preferences (e.g. language).</li>
        <li>Authentication data: login timestamps, IP address, and session identifiers.</li>
        <li>Activity data: simulated orders, positions, virtual ledger entries and watchlists.</li>
        <li>Technical data: device/browser information and a session cookie used to keep you signed in.</li>
      </ul>

      <h2>2. How we use it</h2>
      <ul>
        <li>To provide, secure and operate the platform (authentication, session management, abuse prevention).</li>
        <li>To display your simulated portfolio, performance analytics and statements.</li>
        <li>To send service notifications (order fills, margin calls, price alerts).</li>
        <li>To comply with legal obligations and enforce our Terms.</li>
      </ul>

      <h2>3. Legal bases</h2>
      <p>
        We process data to perform our contract with you, to pursue legitimate interests (security, product
        improvement) and, where required, on the basis of your consent.
      </p>

      <h2>4. Sharing</h2>
      <p>
        We do not sell personal data. We share it only with service providers that help us run the platform (hosting,
        database, market-data and authentication providers) under appropriate safeguards, and where legally required.
      </p>

      <h2>5. Retention</h2>
      <p>
        We keep account and activity data for as long as your account is active and for a reasonable period afterward
        to meet legal, accounting and security requirements.
      </p>

      <h2>6. Your rights</h2>
      <ul>
        <li>Access, correct or delete your personal data.</li>
        <li>Object to or restrict certain processing.</li>
        <li>Export your data (CSV statements are available in the app).</li>
        <li>Withdraw consent at any time where processing is based on consent.</li>
      </ul>

      <h2>7. Security</h2>
      <p>
        We use encryption in transit (HTTPS), hashed passwords, role-based access control and audit logging. No method
        of transmission or storage is 100% secure, but we take reasonable measures to protect your data.
      </p>

      <h2>8. Contact</h2>
      <p>For privacy requests, contact us at the support address listed in the footer.</p>
    </>
  );
}

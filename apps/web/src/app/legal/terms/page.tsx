export const metadata = {
  title: "Terms of Service",
  description: "The terms governing your use of the Realbulls virtual trading platform.",
};

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p>Last updated: {new Date().toLocaleDateString("en-GB")}</p>

      <p>
        By accessing Realbulls you agree to these Terms. Realbulls is a <strong>virtual trading simulator</strong>. All
        balances, orders, positions and profits/losses are simulated using virtual funds and market data for
        educational purposes.
      </p>

      <h2>1. No financial services</h2>
      <p>
        Realbulls does not provide investment advice, brokerage, custody, or any regulated financial service. No real
        money is accepted, held, or traded. Simulated results are not indicative of real trading outcomes.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must keep your user ID and password confidential and are responsible for activity under your account.</li>
        <li>Accounts may be created by an administrator; you agree to provide accurate information.</li>
        <li>We may suspend or close accounts that breach these Terms or abuse the platform.</li>
      </ul>

      <h2>3. Acceptable use</h2>
      <ul>
        <li>Do not attempt to disrupt, reverse engineer or gain unauthorised access to the platform.</li>
        <li>Do not use the platform for unlawful purposes or to scrape market data in violation of provider terms.</li>
      </ul>

      <h2>4. Market data</h2>
      <p>
        Prices may come from third-party providers and are supplied "as is". Some instruments may be simulated. We make
        no warranty as to accuracy, timeliness or availability of data.
      </p>

      <h2>5. Virtual balances</h2>
      <p>
        Virtual balances have no monetary value, are not redeemable, and may be adjusted, reset or removed by an
        administrator at any time.
      </p>

      <h2>6. Disclaimers &amp; liability</h2>
      <p>
        The platform is provided "as is" without warranties of any kind. To the maximum extent permitted by law, we are
        not liable for any indirect or consequential loss arising from your use of the platform.
      </p>

      <h2>7. Changes</h2>
      <p>We may update these Terms; continued use after changes constitutes acceptance.</p>

      <h2>8. Governing law</h2>
      <p>These Terms are governed by the laws applicable to the operator of the platform.</p>
    </>
  );
}

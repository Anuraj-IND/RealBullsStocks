export const metadata = {
  title: "Risk Disclaimer",
  description: "Important risk information for users of the Realbulls simulator.",
};

export default function RiskPage() {
  return (
    <>
      <h1>Risk Disclaimer</h1>
      <p>Last updated: {new Date().toLocaleDateString("en-GB")}</p>

      <h2>Simulated environment</h2>
      <p>
        Realbulls is a <strong>paper-trading simulator</strong>. No real capital is at risk. Balances are virtual and
        have no monetary value.
      </p>

      <h2>Trading involves risk</h2>
      <p>
        Trading real financial instruments carries a high level of risk and can result in the loss of all your capital.
        Leverage magnifies both gains and losses. Simulated performance does not guarantee, and is not indicative of,
        future real-world results.
      </p>

      <h2>Not advice</h2>
      <p>
        Nothing on this platform constitutes investment, financial, legal or tax advice. You are solely responsible for
        your own decisions. Seek independent professional advice before trading real money.
      </p>

      <h2>Data limitations</h2>
      <p>
        Market data may be delayed, simulated, or sourced from third parties and may not reflect actual executable
        prices, spreads, or liquidity.
      </p>

      <h2>No liability</h2>
      <p>
        To the maximum extent permitted by law, Realbulls accepts no liability for any loss arising from reliance on the
        platform or its data.
      </p>
    </>
  );
}

export const metadata = {
  title: "Cookie Policy",
  description: "How Realbulls uses cookies and local storage.",
};

export default function CookiesPage() {
  return (
    <>
      <h1>Cookie &amp; Storage Policy</h1>
      <p>Last updated: {new Date().toLocaleDateString("en-GB")}</p>

      <p>
        Realbulls uses a minimal set of cookies and browser storage to operate securely. We do not use advertising or
        third-party tracking cookies.
      </p>

      <h2>1. Strictly necessary</h2>
      <ul>
        <li>
          <strong>Session tokens (localStorage):</strong> short-lived access and refresh tokens that keep you signed in
          and allow the terminal to reconnect securely.
        </li>
        <li>
          <strong>Preferences (localStorage):</strong> your UI density ("More/Simplified") and language choice.
        </li>
      </ul>

      <h2>2. Authentication providers</h2>
      <p>
        If you sign in with Google or GitHub, the provider may set its own cookies during the authorization step. Their
        use of data is governed by their respective privacy policies.
      </p>

      <h2>3. Managing storage</h2>
      <p>
        You can clear cookies and local storage at any time in your browser settings. Clearing session tokens will sign
        you out. Blocking strictly-necessary storage may prevent the platform from working.
      </p>

      <h2>4. Contact</h2>
      <p>Questions about our use of cookies can be sent to the support address in the footer.</p>
    </>
  );
}

import "dotenv/config";
import crypto from "node:crypto";
import readline from "node:readline";
import { Redis } from "ioredis";

const apiKey = process.env.ZERODHA_API_KEY;
const apiSecret = process.env.ZERODHA_API_SECRET;
const redisUrl = process.env.REDIS_URL;

if (!apiKey || !apiSecret || !redisUrl) {
  console.error("Missing ZERODHA_API_KEY, ZERODHA_API_SECRET, or REDIS_URL");
  process.exit(1);
}

function promptSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    const originalWrite = rl._writeToOutput.bind(rl);
    rl._writeToOutput = () => {};
    rl.question(question, (answer) => {
      rl._writeToOutput = originalWrite;
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function main() {
  const requestToken = await promptSecret("Paste Kite request_token: ");
  if (!requestToken) {
    console.error("No request token provided");
    process.exit(1);
  }

  const checksum = crypto
    .createHash("sha256")
    .update(apiKey + requestToken + apiSecret)
    .digest("hex");

  const response = await fetch("https://api.kite.trade/session/token", {
    method: "POST",
    headers: {
      "X-Kite-Version": "3",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      api_key: apiKey,
      request_token: requestToken,
      checksum,
    }),
  });

  const data = (await response.json()) as {
    status?: string;
    data?: { access_token?: string; user_id?: string };
    message?: string;
  };

  if (data.status !== "success" || !data.data?.access_token) {
    console.error("Kite exchange failed:", data.message ?? "unknown error");
    process.exit(1);
  }

  const redis = new Redis(redisUrl);
  await redis
    .multi()
    .set("zerodha:access_token", data.data.access_token)
    .set("zerodha:user_id", data.data.user_id ?? "")
    .set("zerodha:connected_at", new Date().toISOString())
    .exec();
  await redis.quit();

  console.log("Kite access token stored in Redis.");
  console.log("userId:", data.data.user_id ?? "unknown");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

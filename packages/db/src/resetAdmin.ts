import bcrypt from "bcryptjs";
import { prisma } from "./client.js";

const [, , target, passwordArg] = process.argv;

async function main() {
  if (!target) {
    const admins = await prisma.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "TENANT_ADMIN"] } },
      include: {
        tenant: { select: { slug: true } },
        accounts: { where: { isHouse: false }, select: { balance: true, type: true, status: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    console.log(`[reset-admin] ${admins.length} admin account(s)`);
    for (const a of admins) {
      const acct = a.accounts[0];
      console.log(
        `- ${a.role.padEnd(13)} | user id: ${a.username ?? "-"} | email: ${a.email} | tenant: ${a.tenant.slug} | status: ${a.status} | balance: ${acct ? `${acct.type} ${acct.balance}` : "no account"}`,
      );
    }
    console.log("");
    console.log("Reset a password:  pnpm db:reset-admin <email-or-user-id> [new-password]");
    console.log("List admin id/passwords are only shown after a reset.");
    return;
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: target }, { username: target }, { id: target }] },
  });
  if (!user) {
    console.error(`[reset-admin] no account matched "${target}"`);
    process.exitCode = 1;
    return;
  }

  const password = passwordArg ?? `rb-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, status: "ACTIVE" } });

  console.log("[reset-admin] password reset and account re-activated");
  console.log(`  role:     ${user.role}`);
  console.log(`  user id:  ${user.username ?? "-"}`);
  console.log(`  email:    ${user.email}`);
  console.log(`  password: ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const SSO_BASE_URL = process.env.SSO_BASE_URL ?? "http://localhost:3000";
const SSO_ADMIN_KEY = process.env.SSO_ADMIN_KEY ?? "";

async function main() {
  console.log("Seeding main_db …");

  const applications = [
    {
      clientId: "iipe-app1",
      name: "Academic ERP",
      description: "Independent application #1 — own database (app1_db), own roles",
      url: "http://localhost:3002",
    },
    {
      clientId: "iipe-app2",
      name: "Leave Management",
      description: "Independent application #2 — own database (app2_db), own roles",
      url: "http://localhost:3003",
    },
    {
      clientId: "iipe-app3",
      name: "PhD ERP",
      description: "Independent application #3 — own database (app3_db), own roles",
      url: "http://localhost:3004",
    },
  ];

  for (const a of applications) {
    await prisma.application.upsert({
      where: { clientId: a.clientId },
      update: a,
      create: a,
    });
  }

  // Resolve usernames → SSO user ids (identity lives in sso_db, not here).
  const userIds: Record<string, string> = {};
  try {
    const res = await fetch(`${SSO_BASE_URL}/api/admin/users?key=${SSO_ADMIN_KEY}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      for (const u of data.users) userIds[u.username] = u.id;
      console.log(`Resolved ${Object.keys(userIds).length} users from SSO registry`);
    }
  } catch {
    console.warn("SSO not reachable — seeding grants by username only");
  }

  // (username, clientId, allowed) — demo policy
  const policy = [
    { username: "sanyasi", clientId: "iipe-app1", allowed: true },
    { username: "sanyasi", clientId: "iipe-app2", allowed: true },
    { username: "sanyasi", clientId: "iipe-app3", allowed: true },
    { username: "lakshmi", clientId: "iipe-app1", allowed: true },
    { username: "lakshmi", clientId: "iipe-app2", allowed: false },
    { username: "lakshmi", clientId: "iipe-app3", allowed: false },
    { username: "admin", clientId: "iipe-app1", allowed: true },
    { username: "admin", clientId: "iipe-app2", allowed: false },
    { username: "admin", clientId: "iipe-app3", allowed: true },
    { username: "ramesh", clientId: "iipe-app1", allowed: true },
    { username: "ramesh", clientId: "iipe-app2", allowed: true },
    { username: "ramesh", clientId: "iipe-app3", allowed: true },
    { username: "geeta", clientId: "iipe-app1", allowed: true },
    { username: "geeta", clientId: "iipe-app2", allowed: false },
    { username: "geeta", clientId: "iipe-app3", allowed: true },
    { username: "kiran", clientId: "iipe-app1", allowed: false },
    { username: "kiran", clientId: "iipe-app2", allowed: true },
    { username: "kiran", clientId: "iipe-app3", allowed: false },
    { username: "venkat", clientId: "iipe-app1", allowed: false },
    { username: "venkat", clientId: "iipe-app2", allowed: true },
    { username: "venkat", clientId: "iipe-app3", allowed: true },
  ];

  for (const p of policy) {
    const application = await prisma.application.findUnique({
      where: { clientId: p.clientId },
    });
    if (!application) continue;

    await prisma.userApplication.deleteMany({
      where: { applicationId: application.id, username: p.username },
    });
    if (p.allowed) {
      await prisma.userApplication.create({
        data: {
          userId: userIds[p.username] ?? null,
          username: p.username,
          applicationId: application.id,
        },
      });
    }
  }

  console.log("main_db seeded: 3 applications, demo access policy for 7 users");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

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
      category: "Academic",
      url: process.env.APP1_PUBLIC_URL ?? "http://localhost:3002",
      openInNewTab: true,
    },
    {
      clientId: "iipe-app2",
      name: "Leave Management",
      description: "Independent application #2 — own database (app2_db), own roles",
      category: "ESTB",
      url: process.env.APP2_PUBLIC_URL ?? "http://localhost:3003",
      openInNewTab: true,
    },
    {
      clientId: "iipe-app3",
      name: "PhD ERP",
      description: "Independent application #3 — own database (app3_db), own roles",
      category: "Academic",
      url: process.env.APP3_PUBLIC_URL ?? "http://localhost:3004",
      openInNewTab: true,
    },
    {
      clientId: "iipe-app4",
      name: "Facilities Booking",
      description: "Independent application #4 — building and slot booking (own database app4_db, own roles)",
      category: "Admin",
      url: process.env.APP4_PUBLIC_URL ?? "http://localhost:3005",
      openInNewTab: true,
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
    const res = await fetch(`${SSO_BASE_URL}/api/admin/users`, {
      headers: { "x-admin-key": SSO_ADMIN_KEY },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      for (const u of data.users ?? []) {
        userIds[u.username] = u.id;
      }
    } else {
      console.warn("Could not reach the SSO to resolve user ids — grants will store usernames only.");
    }
  } catch {
    console.warn("Could not reach the SSO to resolve user ids — grants will store usernames only.");
  }

  const grants = [
    { username: "sanyasi", clientId: "iipe-app1" },
    { username: "sanyasi", clientId: "iipe-app2" },
    { username: "sanyasi", clientId: "iipe-app3" },
    { username: "lakshmi", clientId: "iipe-app1" },
    { username: "admin", clientId: "iipe-app1" },
    { username: "admin", clientId: "iipe-app3" },
    { username: "ramesh", clientId: "iipe-app1" },
    { username: "ramesh", clientId: "iipe-app2" },
    { username: "ramesh", clientId: "iipe-app3" },
    { username: "geeta", clientId: "iipe-app1" },
    { username: "geeta", clientId: "iipe-app3" },
    { username: "kiran", clientId: "iipe-app2" },
    { username: "venkat", clientId: "iipe-app2" },
    { username: "venkat", clientId: "iipe-app3" },
    { username: "admin", clientId: "iipe-app4" },
    { username: "sanyasi", clientId: "iipe-app4" },
    { username: "ramesh", clientId: "iipe-app4" },
    { username: "geeta", clientId: "iipe-app4" },
    { username: "lakshmi", clientId: "iipe-app4" },
  ];

  for (const g of grants) {
    const application = await prisma.application.findUnique({
      where: { clientId: g.clientId },
    });
    if (!application) continue;

    const existing = await prisma.userApplication.findFirst({
      where: { username: g.username, applicationId: application.id },
    });
    if (existing) continue;

    await prisma.userApplication.create({
      data: {
        userId: userIds[g.username] ?? null,
        username: g.username,
        applicationId: application.id,
      },
    });
  }

  console.log("Seeded main_db: applications, grants.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

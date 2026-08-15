import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const SSO_BASE_URL = process.env.SSO_BASE_URL ?? "http://localhost:3000";
const SSO_ADMIN_KEY = process.env.SSO_ADMIN_KEY ?? "";

async function main() {
  console.log("Seeding sanapp_main_db …");

  const applications = [
    {
      clientId: "sanapp-app1",
      name: "Academic ERP",
      description: "Independent application #1 — own database (sanapp_app1_db), own roles",
      category: "Academic",
      url: process.env.APP1_PUBLIC_URL ?? "http://localhost:3002",
      openInNewTab: true,
    },
    {
      clientId: "sanapp-app2",
      name: "Leave Management",
      description: "Independent application #2 — own database (sanapp_app2_db), own roles",
      category: "ESTB",
      url: process.env.APP2_PUBLIC_URL ?? "http://localhost:3003",
      openInNewTab: true,
    },
    {
      clientId: "sanapp-app3",
      name: "PhD ERP",
      description: "Independent application #3 — own database (sanapp_app3_db), own roles",
      category: "Academic",
      url: process.env.APP3_PUBLIC_URL ?? "http://localhost:3004",
      openInNewTab: true,
    },
    {
      clientId: "sanapp-facilities",
      name: "Facilities Booking",
      description: "Independent application #4 — building and slot booking (own database sanapp_facilities_db, own roles)",
      category: "Admin",
      url: process.env.APP4_PUBLIC_URL ?? "http://localhost:3005",
      openInNewTab: true,
    },
    {
      clientId: "sanapp-logrequest",
      name: "Log Request",
      description: "Independent application #5 — request tracking (own database sanapp_logrequest_db, own roles)",
      category: "IT Services",
      url: process.env.APP5_PUBLIC_URL ?? "http://localhost:3006",
      openInNewTab: false,
    },
    {
      clientId: "sanapp-inventory",
      name: "Inventory & Asset Tracking",
      description: "Independent application #6 — asset tracking (inventory schema in sanapp_logrequest_db, own roles)",
      category: "IT Services",
      url: process.env.APP6_PUBLIC_URL ?? "http://localhost:3007",
      openInNewTab: false,
    },
  ];

  for (const a of applications) {
    await prisma.application.upsert({
      where: { clientId: a.clientId },
      update: a,
      create: a,
    });
  }

  // Resolve usernames → SSO user ids (identity lives in sanapp_sso_db, not here).
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
    { username: "sanyasi", clientId: "sanapp-app1" },
    { username: "sanyasi", clientId: "sanapp-app2" },
    { username: "sanyasi", clientId: "sanapp-app3" },
    { username: "lakshmi", clientId: "sanapp-app1" },
    { username: "admin", clientId: "sanapp-app1" },
    { username: "admin", clientId: "sanapp-app3" },
    { username: "ramesh", clientId: "sanapp-app1" },
    { username: "ramesh", clientId: "sanapp-app2" },
    { username: "ramesh", clientId: "sanapp-app3" },
    { username: "geeta", clientId: "sanapp-app1" },
    { username: "geeta", clientId: "sanapp-app3" },
    { username: "kiran", clientId: "sanapp-app2" },
    { username: "venkat", clientId: "sanapp-app2" },
    { username: "venkat", clientId: "sanapp-app3" },
    { username: "admin", clientId: "sanapp-facilities" },
    { username: "sanyasi", clientId: "sanapp-facilities" },
    { username: "ramesh", clientId: "sanapp-facilities" },
    { username: "geeta", clientId: "sanapp-facilities" },
    { username: "lakshmi", clientId: "sanapp-facilities" },
    { username: "admin", clientId: "sanapp-logrequest" },
    { username: "sanyasi", clientId: "sanapp-logrequest" },
    { username: "ramesh", clientId: "sanapp-logrequest" },
    { username: "lakshmi", clientId: "sanapp-logrequest" },
    { username: "geeta", clientId: "sanapp-logrequest" },
    { username: "kiran", clientId: "sanapp-logrequest" },
    { username: "venkat", clientId: "sanapp-logrequest" },
    { username: "admin", clientId: "sanapp-inventory" },
    { username: "sanyasi", clientId: "sanapp-inventory" },
    { username: "ramesh", clientId: "sanapp-inventory" },
    { username: "lakshmi", clientId: "sanapp-inventory" },
    { username: "geeta", clientId: "sanapp-inventory" },
    { username: "kiran", clientId: "sanapp-inventory" },
    { username: "venkat", clientId: "sanapp-inventory" },
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

  console.log("Seeded sanapp_main_db: applications, grants.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

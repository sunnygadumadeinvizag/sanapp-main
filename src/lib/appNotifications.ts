import type { AppNotification, Application } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type SerializedNotification = {
  id: string;
  appClientId: string;
  appName: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
};

/** Shape stored in Main / returned by every notifications endpoint. */
export function serializeNotification(
  n: AppNotification & { application: Pick<Application, "name"> }
): SerializedNotification {
  return {
    id: n.id,
    appClientId: n.appClientId,
    appName: n.application.name,
    title: n.title,
    body: n.body,
    href: n.href,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}

/**
 * Resolve the base path of a registered application ("/facilities") to its
 * client id. Main itself ("/main") and the SSO ("/sso") are infrastructure,
 * not registered launchers — they resolve to null (no app-scoped rows).
 */
export async function clientIdForBasePath(
  basePath: string | undefined | null
): Promise<string | null> {
  if (!basePath || basePath === "/") return null;
  const clean = basePath.replace(/\/+$/, "") || "/";
  if (clean === "/main" || clean === "/sso") return null;
  const apps = await prisma.application.findMany({
    select: { clientId: true, url: true },
  });
  for (const a of apps) {
    try {
      if (new URL(a.url).pathname.replace(/\/+$/, "") === clean) return a.clientId;
    } catch {
      /* registry URL not parseable — skip */
    }
  }
  return null;
}

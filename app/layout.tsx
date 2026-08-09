import type { Metadata } from "next";
import "iipe-common-ui/styles.css";
import "./globals.css";
import { ThemeScript } from "iipe-common-ui";

export const metadata: Metadata = {
  title: "IIPE Main — Central Application Access",
  description: "Manage which users can access which IIPE applications",
};

const SSO_BASE_URL = process.env.SSO_BASE_URL!;

async function getTheme() {
  const fallback = { mode: "system", primary: "#0b5d4f", accent: "#d9a441" } as const;
  try {
    const res = await fetch(`${SSO_BASE_URL}/api/theme`, { cache: "no-store" });
    if (!res.ok) return fallback;
    const data = await res.json();
    return {
      mode: data.mode ?? fallback.mode,
      primary: data.primary ?? fallback.primary,
      accent: data.accent ?? fallback.accent,
    };
  } catch {
    return fallback;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getTheme();
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeScript
          defaultMode={theme.mode}
          primary={theme.primary}
          accent={theme.accent}
        />
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "iipe-common-ui/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "IIPE Main — Central Application Access",
  description: "Manage which users can access which IIPE applications",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

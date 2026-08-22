import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The My Apps launcher now lives on the Main home page itself ("/"), so this
 * legacy URL just forwards there. Kept so old bookmarks and links from other
 * applications (`${MAIN_BASE_URL}/my-apps`) keep working.
 */
export default function MyAppsPage() {
  redirect("/");
}

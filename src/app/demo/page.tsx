import { redirect } from "next/navigation";
import Logo from "@/components/Logo";
import { demoBookingUrl } from "@/lib/demo-booking";
import { getT } from "@/lib/i18n/server";
export const dynamic = "force-dynamic";
export default function DemoBooking() {
  const destination = demoBookingUrl(process.env.DEMO_BOOKING_URL);
  if (destination) redirect(destination);
  const t = getT();
  return <main className="min-h-screen bg-gray-50 px-6 py-12"><div className="mx-auto max-w-lg rounded-2xl border border-gray-200 bg-white p-8"><Logo /><h1 className="mt-8 text-2xl font-semibold">{t("landing.hero.cta")}</h1><p className="mt-3 text-gray-600">{t("landing.demo.unavailable")}</p><a href="/" className="btn-outline mt-6">{t("common.back")}</a></div></main>;
}

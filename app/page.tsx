import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: "Payroll & Benefits — Connected Payroll Operations",
  description: "Connect employee data, attendance, payroll, compensation, benefits, claims, and predictive HR analytics in one secure operating system.",
};

export default function HomePage() {
  return <LandingPage />;
}

import { redirect } from "next/navigation";

export default function Page() {
  redirect("/payroll-benefits/compensation?tab=credentials");
}

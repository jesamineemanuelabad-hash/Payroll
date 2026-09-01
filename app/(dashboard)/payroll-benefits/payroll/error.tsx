"use client";

import { CircleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PayrollError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-red-50 text-red-600"><CircleAlert className="size-5" /></span>
        <h1 className="mt-4 text-lg font-semibold text-slate-950">Payroll runs couldn’t be loaded</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">The connection may have been interrupted. Try again; no payroll data was changed.</p>
        <Button className="mt-5" onClick={reset}><RefreshCw />Try again</Button>
      </div>
    </div>
  );
}

import { AlertCircle, Check, CircleDashed, Clock3, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PayrollStatus } from "@/types/payroll";

const statusConfig: Record<PayrollStatus, { label: string; className: string; icon: typeof Check }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600", icon: CircleDashed },
  processing: { label: "Processing", className: "bg-blue-50 text-blue-700", icon: LoaderCircle },
  pending_approval: { label: "Pending approval", className: "bg-amber-50 text-amber-700", icon: Clock3 },
  approved: { label: "Approved", className: "bg-indigo-50 text-indigo-700", icon: Check },
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700", icon: Check },
  failed: { label: "Failed", className: "bg-red-50 text-red-700", icon: AlertCircle },
};

export function PayrollStatusBadge({ status }: { status: PayrollStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-medium", config.className)}>
      <Icon className={cn("size-3", status === "processing" && "animate-spin")} />
      {config.label}
    </span>
  );
}

export function ReviewStatusBadge({ needsReview }: { needsReview: boolean }) {
  return needsReview ? (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-amber-50 px-2 text-xs font-medium text-amber-700"><Clock3 className="size-3" />Needs review</span>
  ) : (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-emerald-50 px-2 text-xs font-medium text-emerald-700"><Check className="size-3" />Ready</span>
  );
}

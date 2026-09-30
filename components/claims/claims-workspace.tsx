"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Download, ExternalLink, Eye, FileText, History, MoreHorizontal, Pencil, ReceiptText, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { claimRecords as initialRecords } from "@/lib/data/operations-sample";
import { formatCurrency } from "@/lib/utils";
import { OperationsPageHeader, RecordToolbar, TableStatus } from "@/components/shared/operations-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ClaimRecord, ExportRecord } from "@/types/operations";

type SimpleClaimStatus = "pending" | "approved" | "rejected";

type ExtendedClaimRecord = ClaimRecord & {
  claimNumber: string;
  expenseDate: string;
  requestedAmount: number;
  approvedAmount: number;
  verificationStatus: "pending" | "verified" | "needs_review" | "missing_document";
  reviewerId?: string;
  reviewerName?: string;
  financeApproverId?: string;
  financeApproverName?: string;
  approvedAt?: string;
  paidAt?: string;
  receiptUrl?: string;
  receiptFileName?: string;
  rejectionReason?: string;
};

function simpleStatus(status: ClaimRecord["status"]): SimpleClaimStatus {
  if (status === "rejected") return "rejected";
  if (status === "approved" || status === "approved_ess" || status === "ready_for_payroll" || status === "included" || status === "paid") {
    return "approved";
  }
  return "pending";
}

const extendedInitialRecords: ExtendedClaimRecord[] = initialRecords.map((rec, idx) => {
  const categories = ["medical", "transportation", "meals", "travel", "communication", "office_expense"];
  const category = categories[idx % categories.length];
  return {
    ...rec,
    category,
    claimNumber: rec.id.replace("CLM", "CLM-2026-"),
    expenseDate: rec.submittedDate,
    requestedAmount: rec.amount,
    approvedAmount: rec.status === "rejected" ? 0 : rec.status === "ready_for_payroll" || rec.status === "included" ? rec.amount : rec.amount * 0.95,
    verificationStatus: rec.verification === "verified" ? "verified" : rec.verification === "needs_review" ? "needs_review" : rec.documents === 0 ? "missing_document" : "pending",
    reviewerId: "USR-SUPER-001",
    reviewerName: "Jesamine Emanuel Abad",
    financeApproverId: rec.status === "ready_for_payroll" || rec.status === "included" ? "USR-FIN-002" : undefined,
    financeApproverName: rec.status === "ready_for_payroll" || rec.status === "included" ? "Finance Lead (R. Reyes)" : undefined,
    approvedAt: rec.status === "ready_for_payroll" || rec.status === "included" ? "2026-09-24T14:30:00Z" : undefined,
    paidAt: rec.status === "included" ? "2026-09-30T17:00:00Z" : undefined,
    receiptUrl: rec.documents > 0 ? "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf" : undefined,
    receiptFileName: rec.documents > 0 ? `receipt_${rec.id.toLowerCase()}_substantiated.pdf` : undefined,
    rejectionReason: rec.status === "rejected" ? "Claim did not meet reimbursement policy." : undefined,
  };
});

const CLAIM_CATEGORIES_LIST = [
  { id: "medical", label: "Medical", description: "Health, dental, optical, and pharmaceutical expenses" },
  { id: "transportation", label: "Transportation", description: "Commute, fuel, parking, and ride-hailing costs" },
  { id: "meals", label: "Meals & Dining", description: "Business meals, client entertainment, and per diem" },
  { id: "travel", label: "Travel & Lodging", description: "Hotel stays, airfare, and travel-related expenses" },
  { id: "communication", label: "Communication", description: "Phone, internet, and data allowances" },
  { id: "office_expense", label: "Office & Supplies", description: "Stationery, equipment, and work-from-home expenses" },
];

const MODULE_TABS = [
  { id: "queue", label: "Reimbursement Queue" },
  { id: "categories", label: "Claim Categories" },
];

const exportColumns = [
  { key: "claimNumber", label: "Claim number", width: 18 },
  { key: "employee", label: "Employee", width: 24 },
  { key: "category", label: "Claim type", width: 18 },
  { key: "expenseDate", label: "Expense date", width: 16, format: "date" as const },
  { key: "requestedAmount", label: "Requested amount", width: 18, format: "currency" as const },
  { key: "approvedAmount", label: "Approved amount", width: 18, format: "currency" as const },
  { key: "verificationStatus", label: "Document review", width: 18 },
  { key: "status", label: "Status", width: 20 },
  { key: "reviewerName", label: "Reviewer", width: 26 },
  { key: "financeApproverName", label: "Finance approver", width: 22 },
];

const simpleStatusLabel: Record<SimpleClaimStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const simpleStatusTone: Record<SimpleClaimStatus, "amber" | "green" | "red"> = {
  pending: "amber",
  approved: "green",
  rejected: "red",
};

const categoryAccents = [
  { bar: "bg-violet-500", icon: "bg-violet-500", badge: "bg-violet-50 text-violet-700" },
  { bar: "bg-fuchsia-500", icon: "bg-fuchsia-500", badge: "bg-fuchsia-50 text-fuchsia-700" },
  { bar: "bg-emerald-500", icon: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700" },
  { bar: "bg-orange-500", icon: "bg-orange-500", badge: "bg-orange-50 text-orange-700" },
  { bar: "bg-sky-500", icon: "bg-sky-500", badge: "bg-sky-50 text-sky-700" },
  { bar: "bg-pink-500", icon: "bg-pink-500", badge: "bg-pink-50 text-pink-700" },
];

export function ClaimsWorkspace() {
  const [records, setRecords] = useState<ExtendedClaimRecord[]>(extendedInitialRecords);
  const [search, setSearch] = useState("");
  const [moduleTab, setModuleTab] = useState("queue");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<ExtendedClaimRecord | null>(extendedInitialRecords[0]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [viewingDocument, setViewingDocument] = useState<ExtendedClaimRecord | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<typeof CLAIM_CATEGORIES_LIST[number] | null>(null);
  const [decision, setDecision] = useState<{ type: "approve" | "reject"; record: ExtendedClaimRecord } | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const filtered = useMemo(
    () =>
      records.filter((record) => {
        const matchesSearch =
          !search ||
          `${record.claimNumber} ${record.employee} ${record.category} ${record.description}`
            .toLowerCase()
            .includes(search.toLowerCase());
        const matchesStatus = statusFilter === "all" || simpleStatus(record.status) === statusFilter;
        return matchesSearch && matchesStatus;
      }),
    [records, search, statusFilter]
  );

  const exports: ExportRecord[] = filtered.map((record) => ({ ...record }));

  function requestApprove(record: ExtendedClaimRecord) {
    if (record.documents === 0 && record.verificationStatus === "missing_document") {
      toast.error("Supporting document required", {
        description: "Request a receipt or upload documentation before approving this claim.",
      });
      return;
    }
    setRejectionReason("");
    setDecision({ type: "approve", record });
  }

  function requestReject(record: ExtendedClaimRecord) {
    setRejectionReason("");
    setDecision({ type: "reject", record });
  }

  function approveClaim(record: ExtendedClaimRecord) {
    const updated: ExtendedClaimRecord = {
      ...record,
      verificationStatus: "verified",
      status: "approved",
      approvedAmount: record.requestedAmount,
      rejectionReason: undefined,
      reviewerId: "USR-SUPER-001",
      reviewerName: "Jesamine Emanuel Abad",
      financeApproverId: "USR-FIN-002",
      financeApproverName: "Finance Lead (R. Reyes)",
      approvedAt: new Date().toISOString(),
    };
    setRecords((current) => current.map((item) => (item.id === record.id ? updated : item)));
    setSelected(updated);
    setDecision(null);
    toast.success("Claim approved", {
      description: `${record.claimNumber} has been approved.`,
    });
  }

  function rejectClaim(record: ExtendedClaimRecord, reason: string) {
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error("Rejection reason required", {
        description: "State why this claim is being rejected before confirming.",
      });
      return;
    }
    const updated: ExtendedClaimRecord = {
      ...record,
      status: "rejected",
      approvedAmount: 0,
      rejectionReason: trimmed,
    };
    setRecords((current) => current.map((item) => (item.id === record.id ? updated : item)));
    setSelected(updated);
    setDecision(null);
    setRejectionReason("");
    toast.success("Claim rejected", {
      description: `${record.claimNumber} was rejected. ${trimmed}`,
    });
  }

  function deleteClaim(record: ExtendedClaimRecord) {
    setRecords((current) => current.filter((item) => item.id !== record.id));
    if (selected?.id === record.id) setSelected(null);
    toast.success("Claim deleted", {
      description: `${record.claimNumber} has been removed. Audit history retained.`,
    });
  }

  return (
    <div className="space-y-6">
      <OperationsPageHeader
        eyebrow="Claims & Reimbursement"
        title="Claims & Reimbursement"
        description="Process employee expense claims, review supporting documentation, approve reimbursements, and link payouts to active payroll runs."
      />

      {/* Module Navigation Tabs */}
      <nav aria-label="Claims workspace modules" className="flex gap-2 overflow-x-auto border-b pb-3">
        {MODULE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setModuleTab(tab.id)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              moduleTab === tab.id
                ? "bg-indigo-50 text-indigo-700 font-semibold"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* TAB 1: REIMBURSEMENT QUEUE — follows attendance tab UI pattern */}
      {moduleTab === "queue" && (
        <section className="space-y-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Reimbursement Queue</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Review, approve, reject, or manage employee reimbursement claims. All actions are logged in the audit trail.
              </p>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border bg-white">
            <RecordToolbar
              search={search}
              onSearch={setSearch}
              placeholder="Search claim #, employee or description…"
              columns={exportColumns}
              records={exports}
              fileName="claims-reimbursements-2026"
              sheetName="Claims"
              showExport={false}
            >
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 shadow-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              </div>
            </RecordToolbar>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[740px] text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">Claim number</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">Employee</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Rejection reason</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">Attached doc</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((record) => (
                    <tr
                      key={record.id}
                      className="border-t hover:bg-slate-50/70"
                    >
                      <td className="whitespace-nowrap px-4 py-4 font-medium text-indigo-700">{record.claimNumber}</td>
                      <td className="px-4 py-4 text-sm text-slate-800">{record.employee}</td>
                      <td className="px-4 py-4">
                        <TableStatus
                          label={simpleStatusLabel[simpleStatus(record.status)]}
                          tone={simpleStatusTone[simpleStatus(record.status)]}
                        />
                      </td>
                      <td className="max-w-[280px] px-4 py-4 text-sm text-slate-600">
                        {simpleStatus(record.status) === "rejected"
                          ? record.rejectionReason || "No reason recorded"
                          : "—"}
                      </td>
                      <td className="px-4 py-4">
                        {record.receiptUrl ? (
                          <button
                            onClick={() => setViewingDocument(record)}
                            className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                          >
                            <FileText className="size-3.5" /> View Receipt
                          </button>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-red-600">
                            <CircleAlert className="size-3.5" /> Missing
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" aria-label="View record" onClick={() => { setSelected(record); setIsDetailOpen(true); }}>
                            <Eye />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label="Approve claim" className="text-emerald-600" onClick={() => requestApprove(record)} disabled={simpleStatus(record.status) === "approved"}>
                            <CheckCircle2 />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label="Reject claim" className="text-amber-600" onClick={() => requestReject(record)} disabled={simpleStatus(record.status) === "rejected"}>
                            <X />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => { setSelected(record); setIsDetailOpen(true); }}>
                                <Eye /> View details
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => toast.info(`Editing ${record.claimNumber}`)}>
                                <Pencil /> Edit claim
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => requestApprove(record)} disabled={simpleStatus(record.status) === "approved"}>
                                <CheckCircle2 /> Approve
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => requestReject(record)} disabled={simpleStatus(record.status) === "rejected"}>
                                <X /> Reject
                              </DropdownMenuItem>
                              {record.receiptUrl && (
                                <DropdownMenuItem onSelect={() => setViewingDocument(record)}>
                                  <ExternalLink /> Preview document
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onSelect={() => toast.info("Audit history opened")}>
                                <History /> View audit history
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-600" onSelect={() => deleteClaim(record)}>
                                <Trash2 /> Delete claim
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length && (
                <p className="px-6 py-14 text-center text-sm text-slate-500">
                  No claims found matching your filter.
                </p>
              )}
            </div>
            <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-slate-500">
              <span>{filtered.length} records</span>
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: CLAIM CATEGORIES — follows department cards UI pattern */}
      {moduleTab === "categories" && (
        <section className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Claim Categories</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Manage and view reimbursement categories. Each category groups related expense types for streamlined processing.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {CLAIM_CATEGORIES_LIST.map((category, index) => {
              const accent = categoryAccents[index % categoryAccents.length];
              const count = records.filter((r) => r.category === category.id).length;
              const totalAmount = records.filter((r) => r.category === category.id).reduce((sum, r) => sum + r.requestedAmount, 0);

              return (
                <article key={category.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className={`h-1.5 ${accent.bar}`} />
                  <div className="p-4">
                    <div className="flex min-h-12 items-center gap-3">
                      <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-white ${accent.icon}`}>
                        <ReceiptText className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold text-slate-900">{category.label}</h3>
                        <span className="mt-1 inline-flex rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium tracking-wide text-slate-600">
                          {category.id.toUpperCase()}
                        </span>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${category.label}`} className="size-8">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setSelectedCategory(category)}>View details</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => toast.info(`Editing ${category.label}`)}>Edit category</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <p className="mt-2 text-xs leading-relaxed text-slate-500">{category.description}</p>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <button type="button" onClick={() => setSelectedCategory(category)} className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800">
                        <FileText className="size-3.5" />
                        {count} {count === 1 ? "claim" : "claims"}
                        <ChevronRight className="size-3.5" />
                      </button>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${accent.badge}`}>
                        {formatCurrency(totalAmount)}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Category Detail Dialog — shows claims in that category */}
          <Dialog open={Boolean(selectedCategory)} onOpenChange={(open) => { if (!open) setSelectedCategory(null); }}>
            <DialogContent className="max-w-2xl">
              <DialogTitle>{selectedCategory?.label ?? "Category"} Claims</DialogTitle>
              <DialogDescription>{selectedCategory?.description} · {records.filter((r) => r.category === selectedCategory?.id).length} claims filed</DialogDescription>
              <ul className="mt-4 max-h-[55vh] divide-y overflow-y-auto">
                {records.filter((r) => r.category === selectedCategory?.id).map((record) => (
                  <li key={record.id} className="flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{record.employee}</span>
                    <span className="shrink-0 text-xs text-slate-500">{record.claimNumber}</span>
                    <span className="shrink-0 text-xs font-semibold text-slate-700">{formatCurrency(record.requestedAmount)}</span>
                    <span className="inline-block">
                      <TableStatus
                        label={simpleStatusLabel[simpleStatus(record.status)]}
                        tone={simpleStatusTone[simpleStatus(record.status)]}
                      />
                    </span>
                  </li>
                ))}
                {records.filter((r) => r.category === selectedCategory?.id).length === 0 && (
                  <li className="py-8 text-center text-sm text-slate-500">No claims filed under this category.</li>
                )}
              </ul>
            </DialogContent>
          </Dialog>
        </section>
      )}

      {/* Document Viewer Modal */}
      {viewingDocument && (
        <Dialog open={Boolean(viewingDocument)} onOpenChange={() => setViewingDocument(null)}>
          <DialogContent className="max-w-3xl">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-5 text-indigo-600" />
              Document Preview: {viewingDocument.claimNumber}
            </DialogTitle>
            <DialogDescription>
              Submitted by {viewingDocument.employee} on {format(parseISO(viewingDocument.expenseDate), "MMMM d, yyyy")}
            </DialogDescription>
            <div className="mt-4 rounded-xl border bg-slate-50 p-4">
              <div className="flex items-center justify-between rounded-lg border bg-white p-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                    <FileText className="size-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {viewingDocument.receiptFileName || "official_receipt_substantiated.pdf"}
                    </p>
                    <p className="text-xs text-slate-500">Official Expense Receipt Document &bull; PDF (1.2 MB)</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => toast.success("Document downloaded to local storage")}
                  >
                    <Download /> Download
                  </Button>
                  <a
                    href={viewingDocument.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    <ExternalLink className="size-3.5" /> Open full page
                  </a>
                </div>
              </div>

              <div className="mt-4 flex min-h-[250px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
                <div className="max-w-md space-y-2">
                  <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                    <ShieldCheck className="size-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900">Substantiated Expense Document</h4>
                  <p className="text-xs text-slate-500">
                    Receipt matches claimed amount of <span className="font-semibold text-slate-800">{formatCurrency(viewingDocument.requestedAmount)}</span> for {viewingDocument.description}.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setViewingDocument(null)}>
                Close Preview
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Claim Detail Modal */}
      {selected && (
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-xl">
            <DialogTitle>Claim Record Details: {selected.claimNumber}</DialogTitle>
            <DialogDescription>Complete workflow details, approval stamps, and full record fields.</DialogDescription>
            <dl className="mt-4 divide-y border-y text-sm">
              <div className="grid grid-cols-2 py-2">
                <dt className="text-slate-500">Claim number</dt>
                <dd className="font-medium text-indigo-700">{selected.claimNumber}</dd>
              </div>
              <div className="grid grid-cols-2 py-2">
                <dt className="text-slate-500">Employee</dt>
                <dd className="font-medium">{selected.employee}</dd>
              </div>
              <div className="grid grid-cols-2 py-2">
                <dt className="text-slate-500">Claim type</dt>
                <dd className="capitalize">{selected.category}</dd>
              </div>
              <div className="grid grid-cols-2 py-2">
                <dt className="text-slate-500">Expense date</dt>
                <dd>{format(parseISO(selected.expenseDate), "MMMM d, yyyy")}</dd>
              </div>
              <div className="grid grid-cols-2 py-2">
                <dt className="text-slate-500">Requested amount</dt>
                <dd className="font-semibold text-slate-900">{formatCurrency(selected.requestedAmount)}</dd>
              </div>
              <div className="grid grid-cols-2 py-2">
                <dt className="text-slate-500">Approved amount</dt>
                <dd className="font-bold text-emerald-700">{formatCurrency(selected.approvedAmount)}</dd>
              </div>
              <div className="grid grid-cols-2 py-2">
                <dt className="text-slate-500">Document review</dt>
                <dd className="capitalize text-emerald-700 font-medium">{selected.verificationStatus.replaceAll("_", " ")}</dd>
              </div>
              <div className="grid grid-cols-2 py-2">
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <TableStatus
                    label={simpleStatusLabel[simpleStatus(selected.status)]}
                    tone={simpleStatusTone[simpleStatus(selected.status)]}
                  />
                </dd>
              </div>
              {simpleStatus(selected.status) === "rejected" && (
                <div className="grid grid-cols-2 py-2">
                  <dt className="text-slate-500">Reason for rejection</dt>
                  <dd className="font-medium text-red-700">{selected.rejectionReason || "No reason recorded"}</dd>
                </div>
              )}
              <div className="grid grid-cols-2 py-2">
                <dt className="text-slate-500">Reviewer ID</dt>
                <dd className="font-medium">{selected.reviewerName || "N/A"}</dd>
              </div>
              <div className="grid grid-cols-2 py-2">
                <dt className="text-slate-500">Finance approver ID</dt>
                <dd>{selected.financeApproverName || "N/A"}</dd>
              </div>
              <div className="grid grid-cols-2 py-2">
                <dt className="text-slate-500">Approved at</dt>
                <dd>{selected.approvedAt ? format(parseISO(selected.approvedAt), "PPP p") : "Not yet approved"}</dd>
              </div>
              <div className="grid grid-cols-2 py-2">
                <dt className="text-slate-500">Paid at</dt>
                <dd>{selected.paidAt ? format(parseISO(selected.paidAt), "PPP p") : "Not yet paid"}</dd>
              </div>
            </dl>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setIsDetailOpen(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {decision && (
        <Dialog
          open={Boolean(decision)}
          onOpenChange={(open) => {
            if (!open) {
              setDecision(null);
              setRejectionReason("");
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogTitle>
              {decision.type === "approve" ? "Approve this claim?" : "Reject this claim?"}
            </DialogTitle>
            <DialogDescription>
              {decision.type === "approve"
                ? `Are you sure you want to approve ${decision.record.claimNumber} for ${decision.record.employee}? This cannot be undone from the queue.`
                : `Are you sure you want to reject ${decision.record.claimNumber} for ${decision.record.employee}? State the reason for rejection.`}
            </DialogDescription>
            {decision.type === "reject" && (
              <label className="mt-4 block">
                <span className="text-xs font-medium text-slate-700">Reason for rejection</span>
                <textarea
                  value={rejectionReason}
                  onChange={(event) => setRejectionReason(event.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="e.g. Receipt is missing or the expense is not eligible."
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
              </label>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary">Cancel</Button>
              </DialogClose>
              {decision.type === "approve" ? (
                <Button type="button" onClick={() => approveClaim(decision.record)}>
                  Yes, approve
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={!rejectionReason.trim()}
                  onClick={() => rejectClaim(decision.record, rejectionReason)}
                >
                  Yes, reject
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}



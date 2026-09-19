"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle, LogOut, ShieldCheck } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

function SignOutSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="min-w-32">
      {pending ? <LoaderCircle className="animate-spin" /> : <LogOut />}
      {pending ? "Signing out…" : "Yes, sign out"}
    </Button>
  );
}

export function SignOutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <div className="border-b border-slate-100 px-6 py-5">
          <span className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
            <ShieldCheck className="size-5" />
          </span>
          <DialogTitle className="mt-4">Sign out of Payroll &amp; Benefits?</DialogTitle>
          <DialogDescription>
            Your secure administrator session will end. You will need your password and authenticator code to access the workspace again.
          </DialogDescription>
        </div>
        <div className="flex flex-col-reverse gap-2 px-6 py-4 sm:flex-row sm:justify-end">
          <DialogClose asChild><Button type="button" variant="secondary">Cancel</Button></DialogClose>
          <form action={signOut}><SignOutSubmitButton /></form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SignOutConfirmation() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 transition hover:text-indigo-600">
        <LogOut className="size-3.5" />Sign out
      </button>
      <SignOutDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

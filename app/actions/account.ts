"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";
import { requiresMfa } from "@/lib/auth/mfa";
import type { WorkspaceSession } from "@/types/payroll";

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(100),
  lastName: z.string().trim().min(1, "Enter your last name.").max(100),
  jobTitle: z.string().trim().min(1, "Enter your job title.").max(150),
  location: z.string().trim().max(150),
}).strict();

const passwordSchema = z.object({
  password: z.string().min(12, "Use at least 12 characters.").regex(/[a-z]/, "Add a lowercase letter.").regex(/[A-Z]/, "Add an uppercase letter.").regex(/[0-9]/, "Add a number."),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });

type AccountResult = { ok: true; message: string } | { ok: false; message: string; fields?: Record<string,string[]> };

export async function updateAccountProfile(input: unknown): Promise<AccountResult> {
  const parsed=profileSchema.safeParse(input);
  if (!parsed.success) return { ok:false,message:"Review the highlighted fields.",fields:parsed.error.flatten().fieldErrors };
  if (!hasSupabaseEnvironment()) return { ok:false,message:"Connect Supabase before updating your profile." };
  try {
    const db=await createSupabaseServerClient();
    const { data:auth }=await db.auth.getUser();
    if (!auth.user) return { ok:false,message:"Your session expired. Sign in again." };
    const { error }=await db.rpc("update_my_account_profile",{p_first_name:parsed.data.firstName,p_last_name:parsed.data.lastName,p_job_title:parsed.data.jobTitle,p_location:parsed.data.location||undefined});
    if (error) return { ok:false,message:error.code==="PGRST202"?"Apply the account-settings migration first.":error.message };
    revalidatePath("/settings/profile"); revalidatePath("/","layout");
    return { ok:true,message:"Your profile was updated." };
  } catch { return { ok:false,message:"Unable to update your profile. Try again." }; }
}

export async function updateAccountPassword(input: unknown): Promise<AccountResult> {
  const parsed=passwordSchema.safeParse(input);
  if (!parsed.success) return { ok:false,message:"Review the password requirements.",fields:parsed.error.flatten().fieldErrors };
  if (!hasSupabaseEnvironment()) return { ok:false,message:"Connect Supabase before changing your password." };
  try {
    const db=await createSupabaseServerClient();
    const { data:auth }=await db.auth.getUser();
    if (!auth.user) return { ok:false,message:"Your session expired. Sign in again." };
    const [{data:session,error:sessionError},{data:assurance,error:assuranceError},{data:factors,error:factorsError}]=await Promise.all([
      db.rpc("workspace_session",{}),
      db.auth.mfa.getAuthenticatorAssuranceLevel(),
      db.auth.mfa.listFactors(),
    ]);
    if(sessionError||assuranceError||factorsError||!assurance||!factors)return{ok:false,message:"Your security status could not be verified. Try again."};
    const workspace=session as unknown as WorkspaceSession|null;
    if ((requiresMfa(workspace?.roles??[])||(factors?.totp.length??0)>0)&&assurance?.currentLevel!=="aal2") return {ok:false,message:"Complete multi-factor authentication before changing your password."};
    const { error }=await db.auth.updateUser({password:parsed.data.password});
    if (error) return { ok:false,message:error.message };
    return { ok:true,message:"Your password was changed." };
  } catch { return { ok:false,message:"Unable to change your password. Try again." }; }
}

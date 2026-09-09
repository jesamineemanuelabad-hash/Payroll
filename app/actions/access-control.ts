"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient, hasSupabaseAdminEnvironment } from "@/lib/supabase/admin";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";

const roles=["super_admin","hr_admin","payroll_manager","hr_manager","manager","employee"] as const;
const updateSchema=z.object({userId:z.string().uuid(),roles:z.array(z.enum(roles)).min(1).max(6),departmentIds:z.array(z.string().uuid()).max(100),isPayrollEmployee:z.boolean(),employmentStatus:z.enum(["active","on_leave","terminated"])}).strict();
const inviteSchema=z.object({employeeNumber:z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,32}$/,"Use 2–32 uppercase letters, numbers, underscores, or hyphens."),firstName:z.string().trim().min(1).max(100),lastName:z.string().trim().min(1).max(100),email:z.string().trim().toLowerCase().email().max(254),jobTitle:z.string().trim().min(1).max(150),departmentId:z.string().uuid().nullable(),role:z.enum(roles)}).strict();
type Result={ok:true;message:string}|{ok:false;message:string;fields?:Record<string,string[]>};

async function requireSuperAdmin() {
  if (!hasSupabaseEnvironment()) return null;
  const db=await createSupabaseServerClient();
  const {data:auth}=await db.auth.getUser();
  if (!auth.user) return null;
  const {data:assigned}=await db.rpc("record_roles",{});
  return assigned?.includes("super_admin")?db:null;
}

export async function updateUserAccess(input:unknown):Promise<Result>{
  const parsed=updateSchema.safeParse(input); if(!parsed.success)return{ok:false,message:"Review the access settings.",fields:parsed.error.flatten().fieldErrors};
  try{const db=await requireSuperAdmin();if(!db)return{ok:false,message:"Only a signed-in super administrator can change access."};
    const {data:profile,error:profileLookupError}=await db.from("profiles").select("employment_status").eq("id",parsed.data.userId).single();
    if(profileLookupError||!profile)return{ok:false,message:"The user profile could not be loaded."};
    const statusChanged=profile.employment_status!==parsed.data.employmentStatus;
    if(statusChanged&&!hasSupabaseAdminEnvironment())return{ok:false,message:"Changing account status requires SUPABASE_SERVICE_ROLE_KEY so Supabase Authentication can be updated safely."};
    if(statusChanged){
      const admin=createSupabaseAdminClient();
      const {error:authError}=await admin.auth.admin.updateUserById(parsed.data.userId,{ban_duration:parsed.data.employmentStatus==="terminated"?"876000h":"none"});
      if(authError)return{ok:false,message:`Authentication access was not changed: ${authError.message}`};
    }
    const {error}=await db.rpc("admin_update_user_access",{p_user_id:parsed.data.userId,p_roles:parsed.data.roles,p_department_ids:parsed.data.departmentIds,p_is_payroll_employee:parsed.data.isPayrollEmployee,p_employment_status:parsed.data.employmentStatus});
    if(error){
      if(statusChanged){
        const admin=createSupabaseAdminClient();
        await admin.auth.admin.updateUserById(parsed.data.userId,{ban_duration:profile.employment_status==="terminated"?"876000h":"none"});
      }
      return{ok:false,message:error.code==="PGRST202"?"Apply the RBAC management migration first.":error.message};
    }
    revalidatePath("/settings/access");revalidatePath("/","layout");return{ok:true,message:"Access settings updated and audited."};
  }catch{return{ok:false,message:"Unable to update access. Refresh before retrying."};}
}

export async function inviteWorkspaceUser(input:unknown):Promise<Result>{
  const parsed=inviteSchema.safeParse(input);if(!parsed.success)return{ok:false,message:"Review the invitation details.",fields:parsed.error.flatten().fieldErrors};
  if(!hasSupabaseAdminEnvironment())return{ok:false,message:"User invitations require SUPABASE_SERVICE_ROLE_KEY on the server."};
  try{const db=await requireSuperAdmin();if(!db)return{ok:false,message:"Only a signed-in super administrator can invite users."};
    const admin=createSupabaseAdminClient();
    const {data:created,error:createError}=await admin.auth.admin.inviteUserByEmail(parsed.data.email,{data:{first_name:parsed.data.firstName,last_name:parsed.data.lastName}});
    if(createError||!created.user)return{ok:false,message:createError?.message.includes("already")?"An authentication user already uses this email.":createError?.message??"The invitation could not be created."};
    const {error:profileError}=await db.rpc("admin_create_invited_profile",{p_user_id:created.user.id,p_employee_number:parsed.data.employeeNumber,p_first_name:parsed.data.firstName,p_last_name:parsed.data.lastName,p_email:parsed.data.email,p_job_title:parsed.data.jobTitle,p_department_id:parsed.data.departmentId,p_initial_role:parsed.data.role});
    if(profileError){await admin.auth.admin.deleteUser(created.user.id);return{ok:false,message:`The invitation was rolled back: ${profileError.message}`};}
    revalidatePath("/settings/access");return{ok:true,message:`Invitation sent to ${parsed.data.email}.`};
  }catch{return{ok:false,message:"Unable to invite the user. Check the Auth email configuration and try again."};}
}

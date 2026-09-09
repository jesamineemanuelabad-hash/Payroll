"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";
import { entities, recordLabel, type RecordRow } from "@/lib/records/config";
import { recordSchema } from "@/lib/records/validation";
import type { Json } from "@/types/database";

type Result<T> = { ok: true; data: T } | { ok: false; message: string; fields?: Record<string, string[]> };
const requestSchema = z.object({ entity: z.string().refine((key) => Object.hasOwn(entities, key)), search: z.string().max(200).default(""), page: z.number().int().min(0).max(100000).default(0), size: z.number().int().min(1).max(1000).default(25), parent: z.string().uuid().optional(), id: z.string().uuid().optional() }).strict();

export async function resolveRecordLabels(input: unknown): Promise<Record<string, string>> {
  const parsed = z.array(z.object({ entity: z.string().refine((key) => Object.hasOwn(entities, key)), ids: z.array(z.string().uuid()).max(100) })).max(10).safeParse(input);
  if (!parsed.success || !hasSupabaseEnvironment()) return {};
  try {
    const db = await createSupabaseServerClient();
    const groups = await Promise.all(parsed.data.map(async ({ entity, ids }) => {
      const { data, error } = await db.rpc("lookup_records", { p_entity: entity, p_ids: ids });
      return error ? [] : (data as unknown as RecordRow[]).map((row) => [row.id, recordLabel(entity, row)]);
    }));
    return Object.fromEntries(groups.flat());
  } catch { return {}; }
}

function databaseMessage(error: { code?: string; message: string }) {
  if (error.code === "23505") return "A record with this reference or employee/period combination already exists.";
  if (error.code === "23503") return "A related record is missing or still references this record. Check the employee/Auth account, or deactivate the record instead of deleting it.";
  if (error.code === "42501") return "Your account does not have permission for this operation.";
  if (error.code === "PGRST202" || error.code === "42P01") return "Database setup is incomplete. Apply all migrations, including 202609050001_record_crud.sql.";
  if (error.code === "23514" || error.code === "23502" || error.code === "22P02") return "Review required fields, dates, and amounts. The database rejected an invalid value.";
  return error.message;
}

export async function readRecords(input: unknown): Promise<Result<{ rows: RecordRow[]; count: number }>> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid record query." };
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase and apply the migrations to manage records. No data has been saved." };
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const value = parsed.data;
    const { data, error } = await db.rpc("list_records", { p_entity: value.entity, p_search: value.search, p_page: value.page, p_size: value.size, p_parent: value.parent, p_id: value.id });
    if (error) return { ok: false, message: databaseMessage(error) };
    return { ok: true, data: data as unknown as { rows: RecordRow[]; count: number } };
  } catch { return { ok: false, message: "Unable to reach the database. Try again." }; }
}

export async function saveRecord(input: unknown): Promise<Result<RecordRow>> {
  const parsed = z.object({ entity: z.string().refine((key) => Object.hasOwn(entities, key)), id: z.string().uuid().optional(), version: z.string().datetime({ offset: true }).optional(), values: z.record(z.string(), z.unknown()) }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid record request." };
  const { entity, id, version, values } = parsed.data;
  const validated = recordSchema(entity, !id).safeParse(values);
  if (!validated.success) return { ok: false, message: "Review the highlighted fields.", fields: validated.error.flatten().fieldErrors as Record<string, string[]> };
  return mutate(entity, id ? "update" : "create", validated.data as Json, id, version);
}

export async function deleteRecord(input: unknown): Promise<Result<RecordRow>> {
  const parsed = z.object({ entity: z.string().refine((key) => Object.hasOwn(entities, key)), id: z.string().uuid(), version: z.string().datetime({ offset: true }) }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid delete request." };
  return mutate(parsed.data.entity, "delete", {}, parsed.data.id, parsed.data.version);
}

async function mutate(entity: string, operation: string, data: Json, id?: string, version?: string): Promise<Result<RecordRow>> {
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase before saving records. Nothing was saved." };
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const { data: roles, error: roleError } = await db.rpc("record_roles", {});
    if (roleError) return { ok: false, message: databaseMessage(roleError) };
    if (!roles?.some((role) => entities[entity].roles.includes(role))) return { ok: false, message: "Your role cannot change these records." };
    const { data: saved, error } = await db.rpc("mutate_record", { p_entity: entity, p_operation: operation, p_data: data, p_id: id, p_version: version });
    if (error) return { ok: false, message: databaseMessage(error) };
    revalidatePath("/", "layout");
    return { ok: true, data: saved as unknown as RecordRow };
  } catch { return { ok: false, message: "Unable to save. Refresh the list to check whether the change completed before retrying." }; }
}

export type AuditEntry = { id: number; action: string; user_id: string | null; created_at: string; old_values: Json; new_values: Json };
export async function readRecordHistory(entity: string, id: string): Promise<Result<AuditEntry[]>> {
  if (!Object.hasOwn(entities, entity) || !z.string().uuid().safeParse(id).success) return { ok: false, message: "Invalid history request." };
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase to read history." };
  try {
    const db = await createSupabaseServerClient();
    const { data, error } = await db.rpc("record_history", { p_entity: entity, p_id: id });
    return error ? { ok: false, message: databaseMessage(error) } : { ok: true, data: data as unknown as AuditEntry[] };
  } catch { return { ok: false, message: "Unable to load history." }; }
}

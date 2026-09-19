import "server-only";
import { xgboostBatchResponseSchema, type AttendanceFeature, type XgboostBatchResult } from "@/lib/analytics/xgboost-contract";

export async function scoreAttendanceWithXgboost(features: AttendanceFeature[]): Promise<XgboostBatchResult> {
  const endpoint = process.env.XGBOOST_SERVICE_URL;
  const token = process.env.XGBOOST_SERVICE_TOKEN;
  if (!endpoint || !token) throw new Error("XGBoost service credentials are not configured.");

  const response = await fetch(`${endpoint.replace(/\/$/, "")}/v1/attendance/predict`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ featureSchemaVersion: "attendance-v1", features }),
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`XGBoost scoring failed with status ${response.status}.`);
  const parsed = xgboostBatchResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("XGBoost returned an invalid prediction payload.");
  return parsed.data;
}

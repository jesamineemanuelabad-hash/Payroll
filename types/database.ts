export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type PayrollStatus = "draft" | "processing" | "pending_approval" | "approved" | "paid" | "failed";

export type Database = {
  public: {
    Tables: {
      payroll_runs: {
        Row: {
          id: string;
          period_start: string;
          period_end: string;
          pay_date: string;
          status: PayrollStatus;
          employee_count: number;
          total_gross: number;
          total_deductions: number;
          total_contributions: number;
          total_net: number;
          created_by: string;
          approved_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          period_start: string;
          period_end: string;
          pay_date: string;
          status?: PayrollStatus;
          employee_count?: number;
          total_gross?: number;
          total_deductions?: number;
          total_contributions?: number;
          total_net?: number;
          created_by?: string;
          approved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payroll_runs"]["Insert"]>;
        Relationships: [];
      };
      payroll_items: {
        Row: {
          id: string;
          payroll_run_id: string;
          employee_id: string;
          basic_salary: number;
          allowances: number;
          overtime: number;
          gross_pay: number;
          deductions: number;
          contributions: number;
          net_pay: number;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["payroll_items"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["payroll_items"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: { payroll_status: PayrollStatus };
    CompositeTypes: Record<string, never>;
  };
};

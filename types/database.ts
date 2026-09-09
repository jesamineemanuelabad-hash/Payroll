export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type PayrollStatus = "draft" | "processing" | "pending_approval" | "approved" | "paid" | "failed";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id:string; employee_number:string; first_name:string; last_name:string; email:string; department_id:string|null; manager_id:string|null; job_title:string; location:string|null; employment_type:string; employment_status:string; hired_at:string|null; is_payroll_employee:boolean; is_system_owner:boolean; created_at:string; updated_at:string };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id:string; employee_number:string; first_name:string; last_name:string; email:string; job_title:string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
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
    Functions: {
      record_roles: { Args: Record<string, never>; Returns: string[] };
      workspace_session: { Args: Record<string, never>; Returns: Json };
      bootstrap_first_admin: { Args: { p_user_id: string; p_employee_number: string; p_first_name: string; p_last_name: string; p_email: string }; Returns: undefined };
      dashboard_snapshot: { Args: { p_months?: number; p_department_id?: string | null; p_location?: string | null; p_employment_type?: string | null }; Returns: Json };
      attendance_scoring_features: { Args: { p_from: string; p_to: string }; Returns: Json };
      save_attendance_predictions: { Args: { p_from: string; p_to: string; p_model_version: string; p_validation_accuracy: number | null; p_artifact_reference: string; p_predictions: Json }; Returns: string };
      calculate_payroll_run: { Args: { p_run_id: string }; Returns: Json };
      calculate_payroll_run_complete: { Args: { p_run_id: string }; Returns: Json };
      transition_payroll_run: { Args: { p_run_id: string; p_target: PayrollStatus }; Returns: Json };
      payroll_run_report: { Args: { p_run_id: string }; Returns: Json };
      update_my_account_profile: { Args: { p_first_name: string; p_last_name: string; p_job_title: string; p_location?: string }; Returns: Json };
      admin_access_snapshot: { Args: { p_search?: string }; Returns: Json };
      admin_update_user_access: { Args: { p_user_id:string; p_roles:string[]; p_department_ids:string[]; p_is_payroll_employee:boolean; p_employment_status:string }; Returns: Json };
      admin_create_invited_profile: { Args: { p_user_id:string; p_employee_number:string; p_first_name:string; p_last_name:string; p_email:string; p_job_title:string; p_department_id:string|null; p_initial_role:string }; Returns: Json };
      lookup_records: { Args: { p_entity: string; p_ids: string[] }; Returns: Json };
      list_records: { Args: { p_entity: string; p_search?: string; p_page?: number; p_size?: number; p_parent?: string; p_id?: string }; Returns: Json };
      mutate_record: { Args: { p_entity: string; p_operation: string; p_data?: Json; p_id?: string; p_version?: string }; Returns: Json };
      record_history: { Args: { p_entity: string; p_id: string }; Returns: Json };
    };
    Enums: { payroll_status: PayrollStatus };
    CompositeTypes: Record<string, never>;
  };
};

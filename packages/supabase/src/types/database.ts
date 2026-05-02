// AUTO-GENERATED from Supabase Postgres schema. Do not edit by hand.
// Regenerate via:
//   curl -sS "https://api.supabase.com/v1/projects/$PROJECT_REF/types/typescript" \
//     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
//     | jq -r '.types' > packages/supabase/src/types/database.ts
//
// Last generated: 2026-05-01 (plan 03-04, project tgswsdfaszvztbpczfve)
// Migration files reflected in this regen:
//   00001_rbac_schema.sql
//   00002_allow_auth_admin_read_user_roles.sql
//   00003_rbac_v2.sql
//   00004_reference_data.sql
//   00005_leads_schema.sql
//   00006_views.sql
//   00007_assignment_function.sql
//   00008_realtime_broadcast.sql
//   00009_queue_rpcs.sql        (plan 03-01)
//   00010_queue_ux_redesign.sql (plan 03-04 — call_attempts/last_outcome,
//                                view rewrite, record_no_answer +
//                                agent_stats_in_range RPCs)

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      callbacks: {
        Row: {
          assigned_to: string
          country_code: string
          created_at: string
          id: string
          lead_id: string
          scheduled_for: string
          status: string
        }
        Insert: {
          assigned_to: string
          country_code: string
          created_at?: string
          id?: string
          lead_id: string
          scheduled_for: string
          status?: string
        }
        Update: {
          assigned_to?: string
          country_code?: string
          created_at?: string
          id?: string
          lead_id?: string
          scheduled_for?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "callbacks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "agent_performance"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "callbacks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "agent_today_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "callbacks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "callbacks_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "callbacks_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "country_leaderboard"
            referencedColumns: ["country_code"]
          },
          {
            foreignKeyName: "callbacks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          created_at: string
          currency: string | null
          name: string
          status: Database["public"]["Enums"]["country_status"]
          timezone: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string | null
          name: string
          status?: Database["public"]["Enums"]["country_status"]
          timezone: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string | null
          name?: string
          status?: Database["public"]["Enums"]["country_status"]
          timezone?: string
        }
        Relationships: []
      }
      forms: {
        Row: {
          created_at: string
          display_name: string
          is_active: boolean
          landing_page_url: string | null
          slug: string
        }
        Insert: {
          created_at?: string
          display_name: string
          is_active?: boolean
          landing_page_url?: string | null
          slug: string
        }
        Update: {
          created_at?: string
          display_name?: string
          is_active?: boolean
          landing_page_url?: string | null
          slug?: string
        }
        Relationships: []
      }
      lead_events: {
        Row: {
          actor_id: string | null
          country_code: string
          created_at: string
          id: string
          lead_id: string
          note: string | null
          outcome: string | null
          payload: Json | null
          type: Database["public"]["Enums"]["event_type"]
        }
        Insert: {
          actor_id?: string | null
          country_code: string
          created_at?: string
          id?: string
          lead_id: string
          note?: string | null
          outcome?: string | null
          payload?: Json | null
          type: Database["public"]["Enums"]["event_type"]
        }
        Update: {
          actor_id?: string | null
          country_code?: string
          created_at?: string
          id?: string
          lead_id?: string
          note?: string | null
          outcome?: string | null
          payload?: Json | null
          type?: Database["public"]["Enums"]["event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "agent_performance"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "lead_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "agent_today_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "lead_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "lead_events_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "lead_events_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "country_leaderboard"
            referencedColumns: ["country_code"]
          },
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          call_attempts: number
          converted_at: string | null
          country_code: string
          created_at: string
          email: string | null
          first_contacted_at: string | null
          form_slug: string
          id: string
          last_outcome: string | null
          lost_at: string | null
          lost_reason: string | null
          message: string | null
          name: string
          phone: string | null
          qualified_at: string | null
          raw_payload: Json | null
          source_url: string | null
          status: Database["public"]["Enums"]["lead_status"]
          submitted_at: string
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          assigned_to?: string | null
          call_attempts?: number
          converted_at?: string | null
          country_code: string
          created_at?: string
          email?: string | null
          first_contacted_at?: string | null
          form_slug: string
          id?: string
          last_outcome?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          message?: string | null
          name: string
          phone?: string | null
          qualified_at?: string | null
          raw_payload?: Json | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          submitted_at: string
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          assigned_to?: string | null
          call_attempts?: number
          converted_at?: string | null
          country_code?: string
          created_at?: string
          email?: string | null
          first_contacted_at?: string | null
          form_slug?: string
          id?: string
          last_outcome?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          message?: string | null
          name?: string
          phone?: string | null
          qualified_at?: string | null
          raw_payload?: Json | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          submitted_at?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "agent_performance"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "agent_today_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leads_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "leads_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "country_leaderboard"
            referencedColumns: ["country_code"]
          },
          {
            foreignKeyName: "leads_form_slug_fkey"
            columns: ["form_slug"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["slug"]
          },
        ]
      }
      user_roles: {
        Row: {
          country_code: Database["public"]["Enums"]["country_code"] | null
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          last_assigned_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          country_code?: Database["public"]["Enums"]["country_code"] | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          last_assigned_at?: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          country_code?: Database["public"]["Enums"]["country_code"] | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          last_assigned_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      agent_performance: {
        Row: {
          agent_id: string | null
          avg_response_seconds: number | null
          conversion_rate: number | null
          country_code: Database["public"]["Enums"]["country_code"] | null
          display_name: string | null
          leads_handled: number | null
          qualification_rate: number | null
        }
        Relationships: []
      }
      agent_today_stats: {
        Row: {
          agent_id: string | null
          converted_today: number | null
          country_code: Database["public"]["Enums"]["country_code"] | null
          done_today: number | null
          follow_ups_count: number | null
          lost_today: number | null
          to_call_count: number | null
        }
        Relationships: []
      }
      country_leaderboard: {
        Row: {
          conversion_rate_30d: number | null
          conversions_30d: number | null
          country_code: string | null
          country_name: string | null
          status: Database["public"]["Enums"]["country_status"] | null
          total_leads_30d: number | null
        }
        Relationships: []
      }
      lead_pipeline_by_country: {
        Row: {
          country_code: string | null
          day: string | null
          lead_count: number | null
          status: Database["public"]["Enums"]["lead_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "leads_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "country_leaderboard"
            referencedColumns: ["country_code"]
          },
        ]
      }
      lead_source_mix: {
        Row: {
          country_code: string | null
          day: string | null
          form_slug: string | null
          lead_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "leads_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "country_leaderboard"
            referencedColumns: ["country_code"]
          },
          {
            foreignKeyName: "leads_form_slug_fkey"
            columns: ["form_slug"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["slug"]
          },
        ]
      }
      speed_to_lead_daily: {
        Row: {
          contacted_count: number | null
          country_code: string | null
          day: string | null
          median_seconds: number | null
          p95_seconds: number | null
          total_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "leads_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "country_leaderboard"
            referencedColumns: ["country_code"]
          },
        ]
      }
    }
    Functions: {
      agent_stats_in_range: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      assign_lead: {
        Args: { p_country: string; p_lead_id: string }
        Returns: string
      }
      complete_call: {
        Args: {
          p_lead_id: string
          p_lost_reason?: string
          p_notes?: string
          p_outcome: string
        }
        Returns: Json
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      ingest_lead: { Args: { payload: Json }; Returns: Json }
      mark_lead_contacted: { Args: { p_lead_id: string }; Returns: Json }
      record_no_answer: { Args: { p_lead_id: string }; Returns: Json }
      schedule_callback: {
        Args: { p_lead_id: string; p_notes?: string; p_scheduled_for: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "hq_admin" | "country_admin" | "agent"
      country_code:
        | "AO"
        | "BW"
        | "CD"
        | "SZ"
        | "KE"
        | "MZ"
        | "NA"
        | "RW"
        | "ZA"
        | "TZ"
        | "UG"
        | "ZM"
        | "LS"
        | "MW"
        | "ZW"
      country_status: "active" | "coming_soon"
      event_type:
        | "created"
        | "assigned"
        | "reassigned"
        | "call"
        | "note"
        | "status_change"
        | "callback_scheduled"
        | "email_sent"
      lead_status: "new" | "contacted" | "qualified" | "converted" | "lost"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["hq_admin", "country_admin", "agent"],
      country_code: [
        "AO",
        "BW",
        "CD",
        "SZ",
        "KE",
        "MZ",
        "NA",
        "RW",
        "ZA",
        "TZ",
        "UG",
        "ZM",
        "LS",
        "MW",
        "ZW",
      ],
      country_status: ["active", "coming_soon"],
      event_type: [
        "created",
        "assigned",
        "reassigned",
        "call",
        "note",
        "status_change",
        "callback_scheduled",
        "email_sent",
      ],
      lead_status: ["new", "contacted", "qualified", "converted", "lost"],
    },
  },
} as const

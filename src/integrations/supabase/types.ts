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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      business_settings: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value?: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      package_orders: {
        Row: {
          amount: number
          created_at: string
          customer_email: string
          customer_id: string | null
          customer_phone: string
          duration_days: number
          id: string
          package_id: string | null
          package_type: string
          payfast_payment_id: string | null
          payment_status: string
          site_id: string | null
          updated_at: string
          vehicle_colour: string
          vehicle_make: string
          vehicle_reg: string
        }
        Insert: {
          amount?: number
          created_at?: string
          customer_email?: string
          customer_id?: string | null
          customer_phone?: string
          duration_days?: number
          id?: string
          package_id?: string | null
          package_type?: string
          payfast_payment_id?: string | null
          payment_status?: string
          site_id?: string | null
          updated_at?: string
          vehicle_colour?: string
          vehicle_make?: string
          vehicle_reg: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_email?: string
          customer_id?: string | null
          customer_phone?: string
          duration_days?: number
          id?: string
          package_id?: string | null
          package_type?: string
          payfast_payment_id?: string | null
          payment_status?: string
          site_id?: string | null
          updated_at?: string
          vehicle_colour?: string
          vehicle_make?: string
          vehicle_reg?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_orders_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      package_wash_logs: {
        Row: {
          id: string
          package_id: string
          site_id: string | null
          site_name: string
          vehicle_reg: string
          wash_type: string
          washed_at: string
        }
        Insert: {
          id?: string
          package_id: string
          site_id?: string | null
          site_name?: string
          vehicle_reg: string
          wash_type?: string
          washed_at?: string
        }
        Update: {
          id?: string
          package_id?: string
          site_id?: string | null
          site_name?: string
          vehicle_reg?: string
          wash_type?: string
          washed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_wash_logs_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "wash_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_wash_logs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_inventory: {
        Row: {
          id: string
          product_id: string | null
          quantity: number
          site_id: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          product_id?: string | null
          quantity?: number
          site_id?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          product_id?: string | null
          quantity?: number
          site_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_inventory_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_products: {
        Row: {
          active: boolean
          category: string
          created_at: string
          description: string
          id: string
          image_url: string | null
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      pos_transaction_items: {
        Row: {
          id: string
          line_total: number
          product_description: string
          product_name: string
          quantity: number
          transaction_id: string
          unit_price: number
        }
        Insert: {
          id?: string
          line_total?: number
          product_description?: string
          product_name: string
          quantity?: number
          transaction_id: string
          unit_price?: number
        }
        Update: {
          id?: string
          line_total?: number
          product_description?: string
          product_name?: string
          quantity?: number
          transaction_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "pos_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          items_count: number
          site_id: string | null
          total: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          items_count?: number
          site_id?: string | null
          total?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          items_count?: number
          site_id?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_transactions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved: boolean
          created_at: string
          display_name: string | null
          id: string
          site_id: string | null
        }
        Insert: {
          approved?: boolean
          created_at?: string
          display_name?: string | null
          id: string
          site_id?: string | null
        }
        Update: {
          approved?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          active: boolean
          address: string
          created_at: string
          id: string
          name: string
          phone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string
          created_at?: string
          id?: string
          name: string
          phone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string
          created_at?: string
          id?: string
          name?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wash_bay_status: {
        Row: {
          current_code: string | null
          current_wash_type: string | null
          id: number
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          current_code?: string | null
          current_wash_type?: string | null
          id?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          current_code?: string | null
          current_wash_type?: string | null
          id?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      wash_codes: {
        Row: {
          code: string
          created_at: string
          customer_phone: string
          expires_at: string
          id: string
          plc_input: number
          price: number
          selected_extras: Json
          site_id: string | null
          total_washes: number
          used: boolean
          used_at: string | null
          vehicle_type: string
          wash_type: Database["public"]["Enums"]["wash_type"]
          washes_used: number
        }
        Insert: {
          code: string
          created_at?: string
          customer_phone?: string
          expires_at: string
          id?: string
          plc_input?: number
          price?: number
          selected_extras?: Json
          site_id?: string | null
          total_washes?: number
          used?: boolean
          used_at?: string | null
          vehicle_type?: string
          wash_type: Database["public"]["Enums"]["wash_type"]
          washes_used?: number
        }
        Update: {
          code?: string
          created_at?: string
          customer_phone?: string
          expires_at?: string
          id?: string
          plc_input?: number
          price?: number
          selected_extras?: Json
          site_id?: string | null
          total_washes?: number
          used?: boolean
          used_at?: string | null
          vehicle_type?: string
          wash_type?: Database["public"]["Enums"]["wash_type"]
          washes_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "wash_codes_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      wash_extras: {
        Row: {
          active: boolean
          id: string
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          id?: string
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      wash_packages: {
        Row: {
          active: boolean
          created_at: string
          customer_phone: string
          end_date: string
          id: string
          price: number
          site_id: string | null
          start_date: string
          updated_at: string
          vehicle_colour: string
          vehicle_make: string
          vehicle_reg: string
          wash_type: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          customer_phone?: string
          end_date: string
          id?: string
          price?: number
          site_id?: string | null
          start_date?: string
          updated_at?: string
          vehicle_colour?: string
          vehicle_make?: string
          vehicle_reg: string
          wash_type?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          customer_phone?: string
          end_date?: string
          id?: string
          price?: number
          site_id?: string | null
          start_date?: string
          updated_at?: string
          vehicle_colour?: string
          vehicle_make?: string
          vehicle_reg?: string
          wash_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wash_packages_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      wash_prices: {
        Row: {
          description: string
          name: string
          price: number
          updated_at: string
          vehicle_type: string
          wash_type: string
        }
        Insert: {
          description?: string
          name?: string
          price?: number
          updated_at?: string
          vehicle_type?: string
          wash_type: string
        }
        Update: {
          description?: string
          name?: string
          price?: number
          updated_at?: string
          vehicle_type?: string
          wash_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_site_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved: { Args: { user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user" | "site_manager"
      wash_type: "basic" | "standard" | "premium" | "ultimate"
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
      app_role: ["admin", "user", "site_manager"],
      wash_type: ["basic", "standard", "premium", "ultimate"],
    },
  },
} as const

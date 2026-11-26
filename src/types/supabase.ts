/**
 * Tipos de la base de datos.
 *
 * ⚠️ PROVISORIO: escrito a mano a partir de supabase/migrations/00{1,2}_*.sql
 * hasta conectar un proyecto. Regenerar con:
 *   npx supabase gen types typescript --project-id <ref> --schema public > src/types/supabase.ts
 * y no editar a mano después.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Required extends keyof Row = never, Readonly extends keyof Row = never> = {
  Row: Row;
  Insert: Omit<{ [K in keyof Row]?: Row[K] }, Readonly> & { [K in Required]: Row[K] };
  Update: Omit<{ [K in keyof Row]?: Row[K] }, Readonly>;
  Relationships: [];
};

export type MemberRole = "super_admin" | "admin" | "receptionist" | "driver";
export type OrderChannel = "pos" | "delivery" | "pickup";
export type OrderStatus =
  | "pending"
  | "preparing"
  | "ready"
  | "on_the_way"
  | "delivered"
  | "cancelled"
  | "rejected";
export type PaymentMethod = "cash" | "card" | "transfer" | "mercadopago";
export type PaymentStatus = "unpaid" | "paid" | "refunded";
export type ZoneType = "radius" | "polygon";
export type StockReason = "sale" | "restock" | "adjustment" | "waste" | "cancellation";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "suspended" | "cancelled";

export type Database = {
  public: {
    Tables: {
      plans: Table<
        {
          id: string;
          code: string;
          name: string;
          price_monthly: number;
          currency: string;
          limits: Json;
          is_active: boolean;
          created_at: string;
        },
        "code" | "name"
      >;
      platform_admins: Table<{ user_id: string; created_at: string }, "user_id">;
      cafes: Table<
        {
          id: string;
          name: string;
          slug: string;
          address: string | null;
          lat: number | null;
          lng: number | null;
          timezone: string;
          is_active: boolean;
          accepts_orders: boolean;
          config: Json;
          created_at: string;
          updated_at: string;
        },
        "name" | "slug"
      >;
      cafe_members: Table<
        {
          id: string;
          cafe_id: string;
          user_id: string;
          role: MemberRole;
          display_name: string | null;
          is_active: boolean;
          created_at: string;
        },
        "cafe_id" | "user_id" | "role"
      >;
      cafe_subscriptions: Table<
        {
          id: string;
          cafe_id: string;
          plan_id: string;
          status: SubscriptionStatus;
          current_period_end: string | null;
          created_at: string;
          updated_at: string;
        },
        "cafe_id" | "plan_id"
      >;
      cafe_hours: Table<
        { id: string; cafe_id: string; weekday: number; opens_at: string; closes_at: string },
        "cafe_id" | "weekday" | "opens_at" | "closes_at"
      >;
      categories: Table<
        {
          id: string;
          cafe_id: string;
          name: string;
          description: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
        "cafe_id" | "name"
      >;
      products: Table<
        {
          id: string;
          cafe_id: string;
          category_id: string | null;
          name: string;
          description: string | null;
          price: number;
          image_url: string | null;
          is_active: boolean;
          is_available: boolean;
          track_stock: boolean;
          /** No legible por columna desde la API: usar la RPC `get_cafe_stock`. */
          stock_qty: number;
          sort_order: number;
          created_at: string;
          updated_at: string;
        },
        "cafe_id" | "name" | "price",
        "stock_qty"
      >;
      product_option_groups: Table<
        {
          id: string;
          cafe_id: string;
          product_id: string;
          name: string;
          min_select: number;
          max_select: number;
          sort_order: number;
        },
        "cafe_id" | "product_id" | "name"
      >;
      product_option_items: Table<
        {
          id: string;
          cafe_id: string;
          group_id: string;
          name: string;
          price_delta: number;
          is_available: boolean;
          sort_order: number;
        },
        "cafe_id" | "group_id" | "name"
      >;
      delivery_zones: Table<
        {
          id: string;
          cafe_id: string;
          name: string;
          zone_type: ZoneType;
          center_lat: number | null;
          center_lng: number | null;
          radius_km: number | null;
          polygon: Json | null;
          area: unknown;
          fee: number;
          min_order: number;
          eta_minutes: number | null;
          priority: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
        "cafe_id" | "name" | "zone_type",
        "area"
      >;
      orders: Table<
        {
          id: string;
          cafe_id: string;
          order_number: number;
          channel: OrderChannel;
          status: OrderStatus;
          customer_name: string | null;
          customer_phone: string | null;
          notes: string | null;
          delivery_address: string | null;
          delivery_lat: number | null;
          delivery_lng: number | null;
          delivery_zone_id: string | null;
          delivery_fee: number;
          subtotal: number;
          total: number;
          payment_method: PaymentMethod;
          payment_status: PaymentStatus;
          driver_id: string | null;
          tracking_token: string;
          created_by: string | null;
          estimated_ready_at: string | null;
          created_at: string;
          updated_at: string;
        },
        never
      >;
      order_items: Table<
        {
          id: string;
          cafe_id: string;
          order_id: string;
          product_id: string | null;
          product_name: string;
          unit_price: number;
          quantity: number;
          line_total: number;
          options: Json;
          notes: string | null;
          created_at: string;
        },
        never
      >;
      order_status_history: Table<
        {
          id: number;
          cafe_id: string;
          order_id: string;
          from_status: OrderStatus | null;
          to_status: OrderStatus;
          changed_by: string | null;
          note: string | null;
          created_at: string;
        },
        never
      >;
      stock_movements: Table<
        {
          id: number;
          cafe_id: string;
          product_id: string | null;
          delta: number;
          reason: StockReason;
          order_id: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
        },
        never
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      create_order: {
        Args: {
          p_cafe_id: string;
          p_channel: OrderChannel;
          p_items: Json;
          p_customer?: Json;
          p_delivery?: Json;
          p_payment_method?: PaymentMethod;
        };
        Returns: { order_id: string; order_number: number; tracking_token: string; total: number }[];
      };
      transition_order_status: {
        Args: { p_order_id: string; p_to: OrderStatus; p_note?: string };
        Returns: OrderStatus;
      };
      assign_driver: { Args: { p_order_id: string; p_driver_id: string | null }; Returns: undefined };
      get_cafe_stock: {
        Args: { p_cafe_id: string };
        Returns: { product_id: string; stock_qty: number }[];
      };
      adjust_stock: {
        Args: { p_product_id: string; p_delta: number; p_reason: StockReason; p_note?: string };
        Returns: number;
      };
      get_order_tracking: { Args: { p_token: string }; Returns: Json };
    };
    Enums: {
      member_role: MemberRole;
      order_channel: OrderChannel;
      order_status: OrderStatus;
      payment_method: PaymentMethod;
      payment_status: PaymentStatus;
      zone_type: ZoneType;
      stock_reason: StockReason;
      subscription_status: SubscriptionStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

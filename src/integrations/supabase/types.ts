export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      chats: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          provider_id: string
          request_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          provider_id: string
          request_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          provider_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chats_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_requests: {
        Row: {
          created_at: string | null
          id: string
          receiver_id: string
          sender_id: string
          status: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          receiver_id: string
          sender_id: string
          status: string
        }
        Update: {
          created_at?: string | null
          id?: string
          receiver_id?: string
          sender_id?: string
          status?: string
        }
        Relationships: []
      }
      friends: {
        Row: {
          created_at: string | null
          friend_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          friend_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          friend_id?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      driver_profiles: {
        Row: {
          available: boolean
          completed_rides: number
          professionalism_avg: number
          punctuality_avg: number
          quality_avg: number
          rating_avg: number
          ratings_count: number
          reputation_level: string
          reputation_score: number
          updated_at: string
          user_id: string
          vehicle_category:
            | Database["public"]["Enums"]["vehicle_category"]
            | null
          vehicle_color: string | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_plate: string | null
          vehicle_year: number | null
        }
        Insert: {
          available?: boolean
          completed_rides?: number
          professionalism_avg?: number
          punctuality_avg?: number
          quality_avg?: number
          rating_avg?: number
          ratings_count?: number
          reputation_level?: string
          reputation_score?: number
          updated_at?: string
          user_id: string
          vehicle_category?:
            | Database["public"]["Enums"]["vehicle_category"]
            | null
          vehicle_color?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          vehicle_year?: number | null
        }
        Update: {
          available?: boolean
          completed_rides?: number
          professionalism_avg?: number
          punctuality_avg?: number
          quality_avg?: number
          rating_avg?: number
          ratings_count?: number
          reputation_level?: string
          reputation_score?: number
          updated_at?: string
          user_id?: string
          vehicle_category?:
            | Database["public"]["Enums"]["vehicle_category"]
            | null
          vehicle_color?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          vehicle_year?: number | null
        }
        Relationships: []
      }
      driver_wallets: {
        Row: {
          balance: number
          currency: string
          total_commission: number
          total_earned: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          currency?: string
          total_commission?: number
          total_earned?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          currency?: string
          total_commission?: number
          total_earned?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      live_locations: {
        Row: {
          heading: number | null
          lat: number
          lng: number
          request_id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          heading?: number | null
          lat: number
          lng: number
          request_id: string
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          heading?: number | null
          lat?: number
          lng?: number
          request_id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_locations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          chat_id: string
          content: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
        }
        Insert: {
          chat_id: string
          content: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
        }
        Update: {
          chat_id?: string
          content?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json | null
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          active: boolean
          base_fare: number
          commission_pct: number
          currency: string
          id: string
          minimum_fare: number
          per_km: number
          per_min: number
          updated_at: string
          vehicle_category: string
        }
        Insert: {
          active?: boolean
          base_fare?: number
          commission_pct?: number
          currency?: string
          id?: string
          minimum_fare?: number
          per_km?: number
          per_min?: number
          updated_at?: string
          vehicle_category: string
        }
        Update: {
          active?: boolean
          base_fare?: number
          commission_pct?: number
          currency?: string
          id?: string
          minimum_fare?: number
          per_km?: number
          per_min?: number
          updated_at?: string
          vehicle_category?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          professionalism: number
          punctuality: number
          quality: number
          ratee_id: string
          rater_id: string
          request_id: string
          stars: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          professionalism?: number
          punctuality?: number
          quality?: number
          ratee_id: string
          rater_id: string
          request_id: string
          stars: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          professionalism?: number
          punctuality?: number
          quality?: number
          ratee_id?: string
          rater_id?: string
          request_id?: string
          stars?: number
        }
        Relationships: [
          {
            foreignKeyName: "ratings_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      reputation_levels: {
        Row: {
          code: string
          color: string
          icon: string
          id: string
          min_score: number
          name_ar: string
          sort_order: number
        }
        Insert: {
          code: string
          color?: string
          icon?: string
          id?: string
          min_score?: number
          name_ar: string
          sort_order?: number
        }
        Update: {
          code?: string
          color?: string
          icon?: string
          id?: string
          min_score?: number
          name_ar?: string
          sort_order?: number
        }
        Relationships: []
      }
      provider_badges: {
        Row: {
          awarded_at: string
          badge_code: string
          badge_color: string
          badge_icon: string
          badge_name_ar: string
          id: string
          user_id: string
        }
        Insert: {
          awarded_at?: string
          badge_code: string
          badge_color?: string
          badge_icon?: string
          badge_name_ar: string
          id?: string
          user_id: string
        }
        Update: {
          awarded_at?: string
          badge_code?: string
          badge_color?: string
          badge_icon?: string
          badge_name_ar?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      request_offers: {
        Row: {
          distance_km: number | null
          expires_at: string
          id: string
          provider_id: string
          request_id: string
          responded_at: string | null
          sent_at: string
          status: string
        }
        Insert: {
          distance_km?: number | null
          expires_at?: string
          id?: string
          provider_id: string
          request_id: string
          responded_at?: string | null
          sent_at?: string
          status?: string
        }
        Update: {
          distance_km?: number | null
          expires_at?: string
          id?: string
          provider_id?: string
          request_id?: string
          responded_at?: string | null
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_offers_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          accepted_at: string | null
          admin_notes: string | null
          cancellation_reason: string | null
          cancelled_by: string | null
          commission: number | null
          completed_at: string | null
          created_at: string
          customer_id: string
          dest_lat: number | null
          dest_lng: number | null
          dest_text: string | null
          distance_km: number | null
          duration_min: number | null
          fare_breakdown: Json | null
          id: string
          level_required: Database["public"]["Enums"]["worker_level"] | null
          notes: string | null
          payment_method: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_text: string
          price_estimate: number | null
          provider_id: string | null
          searching_started_at: string | null
          service_id: string | null
          status: Database["public"]["Enums"]["request_status"]
          type: Database["public"]["Enums"]["request_type"]
          updated_at: string
          vehicle_category:
            | Database["public"]["Enums"]["vehicle_category"]
            | null
          workers_count: number
        }
        Insert: {
          accepted_at?: string | null
          admin_notes?: string | null
          cancellation_reason?: string | null
          cancelled_by?: string | null
          commission?: number | null
          completed_at?: string | null
          created_at?: string
          customer_id: string
          dest_lat?: number | null
          dest_lng?: number | null
          dest_text?: string | null
          distance_km?: number | null
          duration_min?: number | null
          fare_breakdown?: Json | null
          id?: string
          level_required?: Database["public"]["Enums"]["worker_level"] | null
          notes?: string | null
          payment_method?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          pickup_text: string
          price_estimate?: number | null
          provider_id?: string | null
          searching_started_at?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          type: Database["public"]["Enums"]["request_type"]
          updated_at?: string
          vehicle_category?:
            | Database["public"]["Enums"]["vehicle_category"]
            | null
          workers_count?: number
        }
        Update: {
          accepted_at?: string | null
          admin_notes?: string | null
          cancellation_reason?: string | null
          cancelled_by?: string | null
          commission?: number | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          dest_lat?: number | null
          dest_lng?: number | null
          dest_text?: string | null
          distance_km?: number | null
          duration_min?: number | null
          fare_breakdown?: Json | null
          id?: string
          level_required?: Database["public"]["Enums"]["worker_level"] | null
          notes?: string | null
          payment_method?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          pickup_text?: string
          price_estimate?: number | null
          provider_id?: string | null
          searching_started_at?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          type?: Database["public"]["Enums"]["request_type"]
          updated_at?: string
          vehicle_category?:
            | Database["public"]["Enums"]["vehicle_category"]
            | null
          workers_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          icon: string
          id: string
          name_ar: string
          name_en: string
          slug: string
          sort_order: number
        }
        Insert: {
          icon?: string
          id?: string
          name_ar: string
          name_en: string
          slug: string
          sort_order?: number
        }
        Update: {
          icon?: string
          id?: string
          name_ar?: string
          name_en?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          id: string
          code: string
          name_ar: string
          name_en: string
          description_ar: string | null
          tier: number
          max_requests_per_month: number | null
          priority_weight: number
          offer_priority: number
          badge_label: string | null
          badge_color: string | null
          show_stats: boolean
          priority_support: boolean
          monthly_price: number
          yearly_price: number
          currency: string
          is_active: boolean
          sort_order: number
        }
        Insert: {
          id?: string
          code: string
          name_ar: string
          name_en: string
          description_ar?: string | null
          tier: number
          max_requests_per_month?: number | null
          priority_weight?: number
          offer_priority?: number
          badge_label?: string | null
          badge_color?: string | null
          show_stats?: boolean
          priority_support?: boolean
          monthly_price?: number
          yearly_price?: number
          currency?: string
          is_active?: boolean
          sort_order?: number
        }
        Update: {
          id?: string
          code?: string
          name_ar?: string
          name_en?: string
          description_ar?: string | null
          tier?: number
          max_requests_per_month?: number | null
          priority_weight?: number
          offer_priority?: number
          badge_label?: string | null
          badge_color?: string | null
          show_stats?: boolean
          priority_support?: boolean
          monthly_price?: number
          yearly_price?: number
          currency?: string
          is_active?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      subscription_settings: {
        Row: {
          id: string
          subscription_enabled: boolean
          minimum_downloads_before_activation: number
          updated_at: string
        }
        Insert: {
          id?: string
          subscription_enabled?: boolean
          minimum_downloads_before_activation?: number
          updated_at?: string
        }
        Update: {
          id?: string
          subscription_enabled?: boolean
          minimum_downloads_before_activation?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          id: string
          user_id: string
          plan_id: string
          status: string
          billing_cycle: string
          current_period_start: string
          current_period_end: string | null
          request_count: number
          auto_renew: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          plan_id: string
          status?: string
          billing_cycle?: string
          current_period_start?: string
          current_period_end?: string | null
          request_count?: number
          auto_renew?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          plan_id?: string
          status?: string
          billing_cycle?: string
          current_period_start?: string
          current_period_end?: string | null
          request_count?: number
          auto_renew?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          balance_after: number | null
          created_at: string
          currency: string
          id: string
          note: string | null
          request_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          created_at?: string
          currency?: string
          id?: string
          note?: string | null
          request_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          created_at?: string
          currency?: string
          id?: string
          note?: string | null
          request_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_models: {
        Row: {
          base_fare: number
          category: Database["public"]["Enums"]["vehicle_category"]
          created_at: string
          id: string
          make: string
          min_year: number
          model: string
          per_km: number
        }
        Insert: {
          base_fare?: number
          category: Database["public"]["Enums"]["vehicle_category"]
          created_at?: string
          id?: string
          make: string
          min_year?: number
          model: string
          per_km?: number
        }
        Update: {
          base_fare?: number
          category?: Database["public"]["Enums"]["vehicle_category"]
          created_at?: string
          id?: string
          make?: string
          min_year?: number
          model?: string
          per_km?: number
        }
        Relationships: []
      }
      worker_profiles: {
        Row: {
          available: boolean
          bio: string | null
          completed_jobs: number
          level: Database["public"]["Enums"]["worker_level"]
          professionalism_avg: number
          punctuality_avg: number
          quality_avg: number
          rating_avg: number
          ratings_count: number
          reputation_level: string
          reputation_score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          available?: boolean
          bio?: string | null
          completed_jobs?: number
          level?: Database["public"]["Enums"]["worker_level"]
          professionalism_avg?: number
          punctuality_avg?: number
          quality_avg?: number
          rating_avg?: number
          ratings_count?: number
          reputation_level?: string
          reputation_score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          available?: boolean
          bio?: string | null
          completed_jobs?: number
          level?: Database["public"]["Enums"]["worker_level"]
          professionalism_avg?: number
          punctuality_avg?: number
          quality_avg?: number
          rating_avg?: number
          ratings_count?: number
          reputation_level?: string
          reputation_score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      worker_services: {
        Row: {
          service_id: string
          worker_id: string
        }
        Insert: {
          service_id: string
          worker_id: string
        }
        Update: {
          service_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: { id: string; user_id: string | null; action: string; entity_type: string | null; entity_id: string | null; metadata: Json | null; ip_address: string | null; created_at: string | null }
        Insert: { id?: string; user_id?: string | null; action: string; entity_type?: string | null; entity_id?: string | null; metadata?: Json | null; ip_address?: string | null; created_at?: string | null }
        Update: { id?: string; user_id?: string | null; action?: string; entity_type?: string | null; entity_id?: string | null; metadata?: Json | null; ip_address?: string | null; created_at?: string | null }
        Relationships: []
      }
      coupons: {
        Row: { id: string; code: string; type: string; value: number; max_uses: number; used_count: number; expires_at: string | null; active: boolean; min_amount: number; created_at: string | null }
        Insert: { id?: string; code: string; type: string; value: number; max_uses?: number; used_count?: number; expires_at?: string | null; active?: boolean; min_amount?: number; created_at?: string | null }
        Update: { id?: string; code?: string; type?: string; value?: number; max_uses?: number; used_count?: number; expires_at?: string | null; active?: boolean; min_amount?: number; created_at?: string | null }
        Relationships: []
      }
      coupon_redemptions: {
        Row: { id: string; coupon_id: string; user_id: string; request_id: string | null; created_at: string | null }
        Insert: { id?: string; coupon_id: string; user_id: string; request_id?: string | null; created_at?: string | null }
        Update: { id?: string; coupon_id?: string; user_id?: string; request_id?: string | null; created_at?: string | null }
        Relationships: []
      }
      device_fingerprints: {
        Row: { id: string; user_id: string | null; fingerprint: string; device_info: Json | null; first_seen: string; last_seen: string; blocked: boolean }
        Insert: { id?: string; user_id?: string | null; fingerprint: string; device_info?: Json | null; first_seen?: string; last_seen?: string; blocked?: boolean }
        Update: { id?: string; user_id?: string | null; fingerprint?: string; device_info?: Json | null; first_seen?: string; last_seen?: string; blocked?: boolean }
        Relationships: []
      }
      fcm_tokens: {
        Row: { id: string; user_id: string; token: string; created_at: string | null }
        Insert: { id?: string; user_id: string; token: string; created_at?: string | null }
        Update: { id?: string; user_id?: string; token?: string; created_at?: string | null }
        Relationships: []
      }
      provider_verifications: {
        Row: { id: string; user_id: string; role: string; status: string; license_url: string | null; insurance_url: string | null; vehicle_photo_url: string | null; id_card_url: string | null; admin_notes: string | null; reviewed_by: string | null; submitted_at: string | null; reviewed_at: string | null; created_at: string | null }
        Insert: { id?: string; user_id: string; role: string; status: string; license_url?: string | null; insurance_url?: string | null; vehicle_photo_url?: string | null; id_card_url?: string | null; admin_notes?: string | null; reviewed_by?: string | null; submitted_at?: string | null; reviewed_at?: string | null; created_at?: string | null }
        Update: { id?: string; user_id?: string; role?: string; status?: string; license_url?: string | null; insurance_url?: string | null; vehicle_photo_url?: string | null; id_card_url?: string | null; admin_notes?: string | null; reviewed_by?: string | null; submitted_at?: string | null; reviewed_at?: string | null; created_at?: string | null }
        Relationships: []
      }
      rate_limits: {
        Row: { id: string; user_id: string; action: string; created_at: string | null }
        Insert: { id?: string; user_id: string; action: string; created_at?: string | null }
        Update: { id?: string; user_id?: string; action?: string; created_at?: string | null }
        Relationships: []
      }
      referrals: {
        Row: { id: string; referrer_id: string; referred_id: string; referral_code: string; reward_amount: number; status: string; created_at: string | null }
        Insert: { id?: string; referrer_id: string; referred_id: string; referral_code: string; reward_amount?: number; status?: string; created_at?: string | null }
        Update: { id?: string; referrer_id?: string; referred_id?: string; referral_code?: string; reward_amount?: number; status?: string; created_at?: string | null }
        Relationships: []
      }
      scheduled_rides: {
        Row: { id: string; user_id: string; vehicle_category: string | null; pickup_text: string; pickup_lat: number; pickup_lng: number; dest_text: string; dest_lat: number; dest_lng: number; scheduled_at: string; status: string; request_id: string | null; notes: string | null; created_at: string | null }
        Insert: { id?: string; user_id: string; vehicle_category?: string | null; pickup_text: string; pickup_lat: number; pickup_lng: number; dest_text: string; dest_lat: number; dest_lng: number; scheduled_at: string; status?: string; request_id?: string | null; notes?: string | null; created_at?: string | null }
        Update: { id?: string; user_id?: string; vehicle_category?: string | null; pickup_text?: string; pickup_lat?: number; pickup_lng?: number; dest_text?: string; dest_lat?: number; dest_lng?: number; scheduled_at?: string; status?: string; request_id?: string | null; notes?: string | null; created_at?: string | null }
        Relationships: []
      }
      subscription_payments: {
        Row: { id: string; user_id: string; plan_id: string; amount: number; currency: string; billing_cycle: string; payment_method: string | null; status: string; period_start: string; period_end: string | null; created_at: string }
        Insert: { id?: string; user_id: string; plan_id: string; amount: number; currency?: string; billing_cycle?: string; payment_method?: string | null; status?: string; period_start?: string; period_end?: string | null; created_at?: string }
        Update: { id?: string; user_id?: string; plan_id?: string; amount?: number; currency?: string; billing_cycle?: string; payment_method?: string | null; status?: string; period_start?: string; period_end?: string | null; created_at?: string }
        Relationships: []
      }
      subscription_expiry_notifications: {
        Row: { id: string; user_id: string; subscription_id: string; days_before: number; sent_at: string }
        Insert: { id?: string; user_id: string; subscription_id: string; days_before: number; sent_at?: string }
        Update: { id?: string; user_id?: string; subscription_id?: string; days_before?: number; sent_at?: string }
        Relationships: []
      }
      support_tickets: {
        Row: { id: string; user_id: string; subject: string; description: string; category: string; priority: string; status: string; created_at: string; updated_at: string; closed_at: string | null }
        Insert: { id?: string; user_id: string; subject: string; description: string; category?: string; priority?: string; status?: string; created_at?: string; updated_at?: string; closed_at?: string | null }
        Update: { id?: string; user_id?: string; subject?: string; description?: string; category?: string; priority?: string; status?: string; created_at?: string; updated_at?: string; closed_at?: string | null }
        Relationships: []
      }
      support_ticket_messages: {
        Row: { id: string; ticket_id: string; sender_id: string; message: string; is_staff: boolean; created_at: string }
        Insert: { id?: string; ticket_id: string; sender_id: string; message: string; is_staff?: boolean; created_at?: string }
        Update: { id?: string; ticket_id?: string; sender_id?: string; message?: string; is_staff?: boolean; created_at?: string }
        Relationships: []
      }
      surge_zones: {
        Row: { id: string; name: string; center_lat: number; center_lng: number; radius_km: number; multiplier: number; start_hour: number; end_hour: number; active: boolean; created_at: string | null }
        Insert: { id?: string; name: string; center_lat: number; center_lng: number; radius_km: number; multiplier?: number; start_hour?: number; end_hour?: number; active?: boolean; created_at?: string | null }
        Update: { id?: string; name?: string; center_lat?: number; center_lng?: number; radius_km?: number; multiplier?: number; start_hour?: number; end_hour?: number; active?: boolean; created_at?: string | null }
        Relationships: []
      }
      user_blocks: {
        Row: { id: string; user_id: string; blocked_by: string | null; reason: string | null; blocked_at: string; expires_at: string | null }
        Insert: { id?: string; user_id: string; blocked_by?: string | null; reason?: string | null; blocked_at?: string; expires_at?: string | null }
        Update: { id?: string; user_id?: string; blocked_by?: string | null; reason?: string | null; blocked_at?: string; expires_at?: string | null }
        Relationships: []
      }
      user_devices: {
        Row: { id: string; user_id: string; device_id: string; platform: string | null; app_version: string | null; last_seen: string | null; created_at: string | null }
        Insert: { id?: string; user_id: string; device_id: string; platform?: string | null; app_version?: string | null; last_seen?: string | null; created_at?: string | null }
        Update: { id?: string; user_id?: string; device_id?: string; platform?: string | null; app_version?: string | null; last_seen?: string | null; created_at?: string | null }
        Relationships: []
      }
      user_reports: {
        Row: { id: string; reporter_id: string; reported_id: string | null; reason: string; details: string | null; report_type: string; target_type: string | null; target_id: string | null; status: string; created_at: string; resolved_at: string | null; resolved_by: string | null; resolution_note: string | null }
        Insert: { id?: string; reporter_id: string; reported_id?: string | null; reason: string; details?: string | null; report_type: string; target_type?: string | null; target_id?: string | null; status?: string; created_at?: string; resolved_at?: string | null; resolved_by?: string | null; resolution_note?: string | null }
        Update: { id?: string; reporter_id?: string; reported_id?: string | null; reason?: string; details?: string | null; report_type?: string; target_type?: string | null; target_id?: string | null; status?: string; created_at?: string; resolved_at?: string | null; resolved_by?: string | null; resolution_note?: string | null }
        Relationships: []
      }
    }
    Views: {
      driver_public_stats: {
        Row: {
          available: boolean | null
          rating_avg: number | null
          ratings_count: number | null
          user_id: string | null
          vehicle_category:
            | Database["public"]["Enums"]["vehicle_category"]
            | null
        }
        Insert: {
          available?: boolean | null
          rating_avg?: number | null
          ratings_count?: number | null
          user_id?: string | null
          vehicle_category?:
            | Database["public"]["Enums"]["vehicle_category"]
            | null
        }
        Update: {
          available?: boolean | null
          rating_avg?: number | null
          ratings_count?: number | null
          user_id?: string | null
          vehicle_category?:
            | Database["public"]["Enums"]["vehicle_category"]
            | null
        }
        Relationships: []
      }
      worker_public_stats: {
        Row: {
          available: boolean | null
          level: Database["public"]["Enums"]["worker_level"] | null
          rating_avg: number | null
          ratings_count: number | null
          user_id: string | null
        }
        Insert: {
          available?: boolean | null
          level?: Database["public"]["Enums"]["worker_level"] | null
          rating_avg?: number | null
          ratings_count?: number | null
          user_id?: string | null
        }
        Update: {
          available?: boolean | null
          level?: Database["public"]["Enums"]["worker_level"] | null
          rating_avg?: number | null
          ratings_count?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      find_nearby_drivers: {
        Args: {
          _category: string
          _lat: number
          _limit?: number
          _lng: number
          _radius_km?: number
        }
        Returns: {
          distance_km: number
          rating_avg: number
          user_id: string
        }[]
      }
      find_nearby_provider_pins: {
        Args: {
          _category?: string
          _lat: number
          _limit?: number
          _lng: number
          _radius_km?: number
          _service_id?: string
          _type: string
        }
        Returns: {
          heading: number
          lat: number
          lng: number
          pin_id: string
        }[]
      }
      get_provider_reputation: {
        Args: {
          p_user_id: string
        }
        Returns: Json
      }
      grant_provider_role_safe: {
        Args: {
          _user_id: string
          _role: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lookup_email_by_phone: {
        Args: {
          _phone: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "customer" | "driver" | "worker" | "admin"
      request_status:
        | "pending"
        | "searching"
        | "accepted"
        | "in_progress"
        | "completed"
        | "cancelled"
      request_type: "taxi" | "service"
      vehicle_category: "economy" | "premium" | "luxury"
      worker_level: "fani" | "khabir"
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
      app_role: ["customer", "driver", "worker", "admin"],
      request_status: [
        "pending",
        "searching",
        "accepted",
        "in_progress",
        "completed",
        "cancelled",
      ],
      request_type: ["taxi", "service"],
      vehicle_category: ["economy", "premium", "luxury"],
      worker_level: ["fani", "khabir"],
    },
  },
} as const

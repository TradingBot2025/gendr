export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      admin_actions: {
        Row: {
          action_type: string;
          admin_id: string;
          created_at: string;
          details: string | null;
          id: string;
          target_id: string;
        };
        Insert: {
          action_type: string;
          admin_id: string;
          created_at?: string;
          details?: string | null;
          id?: string;
          target_id: string;
        };
        Update: {
          action_type?: string;
          admin_id?: string;
          created_at?: string;
          details?: string | null;
          id?: string;
          target_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_actions_admin_id_fkey";
            columns: ["admin_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_actions_admin_id_fkey";
            columns: ["admin_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_actions_target_id_fkey";
            columns: ["target_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_actions_target_id_fkey";
            columns: ["target_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ads_placements: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          position: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          position?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          position?: string;
        };
        Relationships: [];
      };
      album_access_requests: {
        Row: {
          album_id: string;
          created_at: string;
          id: string;
          note: string | null;
          requester_id: string;
          status: string;
        };
        Insert: {
          album_id: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          requester_id: string;
          status?: string;
        };
        Update: {
          album_id?: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          requester_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "album_access_requests_album_id_fkey";
            columns: ["album_id"];
            isOneToOne: false;
            referencedRelation: "photo_albums";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "album_access_requests_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "album_access_requests_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      connections: {
        Row: {
          addressee: string;
          created_at: string;
          disappear_seconds: number;
          id: string;
          requester: string;
          status: string;
        };
        Insert: {
          addressee: string;
          created_at?: string;
          disappear_seconds?: number;
          id?: string;
          requester: string;
          status?: string;
        };
        Update: {
          addressee?: string;
          created_at?: string;
          disappear_seconds?: number;
          id?: string;
          requester?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "connections_addressee_fkey";
            columns: ["addressee"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connections_addressee_fkey";
            columns: ["addressee"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connections_requester_fkey";
            columns: ["requester"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connections_requester_fkey";
            columns: ["requester"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_by: string | null;
          code: string;
          created_at: string;
          email: string;
          id: string;
          inviter: string;
        };
        Insert: {
          accepted_by?: string | null;
          code?: string;
          created_at?: string;
          email: string;
          id?: string;
          inviter: string;
        };
        Update: {
          accepted_by?: string | null;
          code?: string;
          created_at?: string;
          email?: string;
          id?: string;
          inviter?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_inviter_fkey";
            columns: ["inviter"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_inviter_fkey";
            columns: ["inviter"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          attachment_name: string | null;
          attachment_path: string | null;
          attachment_type: string | null;
          attachment_viewed_at: string | null;
          body: string | null;
          connection_id: string;
          created_at: string;
          expires_at: string | null;
          id: string;
          max_views: number | null;
          read_at: string | null;
          sender: string;
          unsent: boolean;
          view_count: number;
        };
        Insert: {
          attachment_name?: string | null;
          attachment_path?: string | null;
          attachment_type?: string | null;
          attachment_viewed_at?: string | null;
          body?: string | null;
          connection_id: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          max_views?: number | null;
          read_at?: string | null;
          sender: string;
          unsent?: boolean;
          view_count?: number;
        };
        Update: {
          attachment_name?: string | null;
          attachment_path?: string | null;
          attachment_type?: string | null;
          attachment_viewed_at?: string | null;
          body?: string | null;
          connection_id?: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          max_views?: number | null;
          read_at?: string | null;
          sender?: string;
          unsent?: boolean;
          view_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "messages_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "connections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_fkey";
            columns: ["sender"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_fkey";
            columns: ["sender"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      photo_albums: {
        Row: {
          created_at: string;
          id: string;
          is_private: boolean;
          name: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_private?: boolean;
          name?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_private?: boolean;
          name?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "photo_albums_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "photo_albums_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      photos: {
        Row: {
          album_id: string | null;
          created_at: string;
          id: string;
          is_private: boolean;
          path: string;
          position: number;
          preview_path: string | null;
          user_id: string;
          view_timer: string;
        };
        Insert: {
          album_id?: string | null;
          created_at?: string;
          id?: string;
          is_private?: boolean;
          path: string;
          position?: number;
          preview_path?: string | null;
          user_id: string;
          view_timer?: string;
        };
        Update: {
          album_id?: string | null;
          created_at?: string;
          id?: string;
          is_private?: boolean;
          path?: string;
          position?: number;
          preview_path?: string | null;
          user_id?: string;
          view_timer?: string;
        };
        Relationships: [
          {
            foreignKeyName: "photos_album_id_fkey";
            columns: ["album_id"];
            isOneToOne: false;
            referencedRelation: "photo_albums";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "photos_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "photos_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_views: {
        Row: {
          created_at: string;
          id: string;
          viewed_id: string;
          viewer_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          viewed_id: string;
          viewer_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          viewed_id?: string;
          viewer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_views_viewed_id_fkey";
            columns: ["viewed_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_views_viewed_id_fkey";
            columns: ["viewed_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_views_viewer_id_fkey";
            columns: ["viewer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_views_viewer_id_fkey";
            columns: ["viewer_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          banned: boolean;
          bio: string | null;
          birthdate: string | null;
          children: string | null;
          city: string | null;
          country: string | null;
          created_at: string;
          display_name: string | null;
          education: string | null;
          email: string | null;
          gender: string | null;
          height: number | null;
          id: string;
          is_online: boolean;
          last_seen_at: string | null;
          looking_for: string | null;
          marital_status: string | null;
          orientation: string | null;
          username: string | null;
          verified: boolean;
          video_call_enabled: boolean;
          voice_call_enabled: boolean;
          weight: number | null;
        };
        Insert: {
          banned?: boolean;
          bio?: string | null;
          birthdate?: string | null;
          children?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          display_name?: string | null;
          education?: string | null;
          email?: string | null;
          gender?: string | null;
          height?: number | null;
          id: string;
          is_online?: boolean;
          last_seen_at?: string | null;
          looking_for?: string | null;
          marital_status?: string | null;
          orientation?: string | null;
          username?: string | null;
          verified?: boolean;
          video_call_enabled?: boolean;
          voice_call_enabled?: boolean;
          weight?: number | null;
        };
        Update: {
          banned?: boolean;
          bio?: string | null;
          birthdate?: string | null;
          children?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          display_name?: string | null;
          education?: string | null;
          email?: string | null;
          gender?: string | null;
          height?: number | null;
          id?: string;
          is_online?: boolean;
          last_seen_at?: string | null;
          looking_for?: string | null;
          marital_status?: string | null;
          orientation?: string | null;
          username?: string | null;
          verified?: boolean;
          video_call_enabled?: boolean;
          voice_call_enabled?: boolean;
          weight?: number | null;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          user_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      random_match_history: {
        Row: {
          created_at: string;
          id: string;
          matched_user_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          matched_user_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          matched_user_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "random_match_history_matched_user_id_fkey";
            columns: ["matched_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "random_match_history_matched_user_id_fkey";
            columns: ["matched_user_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "random_match_history_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "random_match_history_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      random_matchmaking_queue: {
        Row: {
          country_code: string;
          created_at: string;
          expires_at: string;
          id: string;
          matched_with: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          country_code?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          matched_with?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          country_code?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          matched_with?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "random_matchmaking_queue_matched_with_fkey";
            columns: ["matched_with"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "random_matchmaking_queue_matched_with_fkey";
            columns: ["matched_with"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "random_matchmaking_queue_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "random_matchmaking_queue_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      referrals: {
        Row: {
          code: string;
          completed_at: string | null;
          created_at: string;
          id: string;
          referee_id: string | null;
          referrer_id: string;
          status: string;
        };
        Insert: {
          code: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          referee_id?: string | null;
          referrer_id: string;
          status?: string;
        };
        Update: {
          code?: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          referee_id?: string | null;
          referrer_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "referrals_referee_id_fkey";
            columns: ["referee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "referrals_referee_id_fkey";
            columns: ["referee_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey";
            columns: ["referrer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey";
            columns: ["referrer_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          auto_blocked: boolean;
          created_at: string;
          id: string;
          proof_file_path: string | null;
          proof_text: string | null;
          reason: string;
          reason_category: string | null;
          reported_id: string;
          reporter_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
        };
        Insert: {
          auto_blocked?: boolean;
          created_at?: string;
          id?: string;
          proof_file_path?: string | null;
          proof_text?: string | null;
          reason: string;
          reason_category?: string | null;
          reported_id: string;
          reporter_id: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
        };
        Update: {
          auto_blocked?: boolean;
          created_at?: string;
          id?: string;
          proof_file_path?: string | null;
          proof_text?: string | null;
          reason?: string;
          reason_category?: string | null;
          reported_id?: string;
          reporter_id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reports_reported_id_fkey";
            columns: ["reported_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reported_id_fkey";
            columns: ["reported_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      public_profiles: {
        Row: {
          age: number | null;
          bio: string | null;
          children: string | null;
          city: string | null;
          country: string | null;
          created_at: string | null;
          display_name: string | null;
          education: string | null;
          gender: string | null;
          height: number | null;
          id: string | null;
          is_online: boolean | null;
          last_seen_at: string | null;
          looking_for: string | null;
          marital_status: string | null;
          orientation: string | null;
          username: string | null;
          verified: boolean | null;
          weight: number | null;
        };
        Insert: {
          age?: never;
          bio?: string | null;
          children?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string | null;
          display_name?: string | null;
          education?: string | null;
          gender?: string | null;
          height?: number | null;
          id?: string | null;
          is_online?: boolean | null;
          last_seen_at?: string | null;
          looking_for?: string | null;
          marital_status?: string | null;
          orientation?: string | null;
          username?: string | null;
          verified?: boolean | null;
          weight?: number | null;
        };
        Update: {
          age?: never;
          bio?: string | null;
          children?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string | null;
          display_name?: string | null;
          education?: string | null;
          gender?: string | null;
          height?: number | null;
          id?: string | null;
          is_online?: boolean | null;
          last_seen_at?: string | null;
          looking_for?: string | null;
          marital_status?: string | null;
          orientation?: string | null;
          username?: string | null;
          verified?: boolean | null;
          weight?: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      accept_invitation: { Args: { _code: string }; Returns: undefined };
      admin_set_flags: {
        Args: { _banned: boolean; _target: string; _verified: boolean };
        Returns: undefined;
      };
      auto_block_reported_user: {
        Args: { _reported_id: string; _reporter_id: string };
        Returns: undefined;
      };
      can_read_photo: { Args: { _path: string }; Returns: boolean };
      clear_all_chats: { Args: never; Returns: number };
      clear_chat: { Args: { _connection_id: string }; Returns: number };
      discover_profiles: {
        Args: {
          _gender?: string;
          _limit?: number;
          _max_age?: number;
          _min_age?: number;
          _offset?: number;
          _online_only?: boolean;
          _orientation?: string;
          _place?: string;
          _sort_fresh?: boolean;
          _verified_only?: boolean;
        };
        Returns: {
          age: number;
          bio: string;
          city: string;
          connection_id: string;
          connection_requester: string;
          connection_status: string;
          country: string;
          created_at: string;
          display_name: string;
          gender: string;
          id: string;
          last_seen_at: string;
          orientation: string;
          photo_path: string;
          username: string;
          verified: boolean;
        }[];
      };
      find_random_match: {
        Args: { _country_code?: string };
        Returns: {
          peer_id: string;
          peer_name: string;
        }[];
      };
      get_call_settings: {
        Args: { _user_id: string };
        Returns: {
          video_call_enabled: boolean;
          voice_call_enabled: boolean;
        }[];
      };
      get_profile_views_paginated: {
        Args: { _limit?: number; _offset?: number };
        Returns: {
          age: number;
          bio: string;
          city: string;
          connection_id: string;
          connection_requester: string;
          connection_status: string;
          country: string;
          display_name: string;
          gender: string;
          id: string;
          orientation: string;
          photo_path: string;
          username: string;
          verified: boolean;
          viewed_at: string;
          viewer_id: string;
        }[];
      };
      get_turn_credentials: {
        Args: never;
        Returns: {
          credential: string;
          ttl: number;
          urls: string[];
          username: string;
        }[];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      increment_message_view: { Args: { message_id: string }; Returns: boolean };
      is_connected: { Args: { _conn: string }; Returns: boolean };
      leave_random_queue: { Args: never; Returns: undefined };
      mark_chat_read: { Args: { _connection_id: string }; Returns: undefined };
      set_chat_timer: {
        Args: { _connection_id: string; _seconds: number };
        Returns: undefined;
      };
      unsend_message: { Args: { _message_id: string }; Returns: undefined };
    };
    Enums: {
      app_role: "admin" | "user";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const;

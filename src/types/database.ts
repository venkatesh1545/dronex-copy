export interface Database {
  public: {
    Tables: {
      ai_chat_messages: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          message_type: 'user' | 'assistant' | 'system';
          content: string;
          audio_url: string | null;
          emergency_detected: boolean | null;
          location_data: unknown;
          safe_places: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          user_id: string;
          message_type: 'user' | 'assistant' | 'system';
          content: string;
          audio_url?: string | null;
          emergency_detected?: boolean | null;
          location_data?: unknown;
          safe_places?: unknown;
          created_at?: string;
        };
      };
    };
  };
}

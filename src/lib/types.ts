export type Role = "admin" | "user"

export type Tone = "formal" | "profesional" | "amigable" | "educativo" | "tecnico" | "casual"
export type ResponseLength = "corta" | "media" | "detallada"

export interface AssistantSettings {
  name: string
  description: string
  topic: string
  welcome_message: string
  suggested_questions: string[]
  tone: Tone
  communication_style: string
  response_length: ResponseLength
  custom_instructions: string
  allowed_topics: string
  rules: string
  procedures: string
  unknown_message: string
  off_topic_message: string
  similarity_threshold: number
  chat_model: string
  monthly_free_questions: number
  max_output_tokens: number
  max_input_tokens: number
  max_chunks: number
  global_monthly_limit: number
  monthly_budget_usd: number
  brand_color: string
  brand_accent: string
  logo_url: string | null
  icon_url: string | null
  allowed_email_domains: string[]
  updated_at: string
}

/** Información del asistente que puede verse en el chat (sin instrucciones internas). */
export type PublicAssistantInfo = Pick<
  AssistantSettings,
  | "name"
  | "description"
  | "topic"
  | "welcome_message"
  | "suggested_questions"
  | "brand_color"
  | "brand_accent"
  | "logo_url"
  | "icon_url"
  | "allowed_email_domains"
>

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: Role
  bonus_balance: number
  bonus_granted_total: number
  created_at: string
}

export type DocumentStatus = "pending" | "processing" | "ready" | "error"

export interface DocumentRow {
  id: string
  name: string
  storage_path: string
  mime_type: string
  size_bytes: number
  status: DocumentStatus
  error: string | null
  chunk_count: number
  created_at: string
}

export interface Source {
  index: number
  document_id: string
  document_name: string
  excerpt: string
  similarity: number
}

export type MessageStatus = "answered" | "off_topic" | "no_info" | "error"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  status: MessageStatus | null
  sources: Source[]
  created_at: string
}

export interface Conversation {
  id: string
  title: string
  updated_at: string
}

export interface Quota {
  free_limit: number
  free_used: number
  bonus_used: number
  bonus_balance: number
  remaining: number
}

export type RequestStatus = "pending" | "approved" | "rejected"

export interface QuestionRequest {
  id: string
  user_id: string
  requested: number
  reason: string | null
  status: RequestStatus
  granted: number | null
  reviewed_at: string | null
  created_at: string
}

/** Eventos del stream NDJSON que devuelve /api/chat. */
export type ChatStreamEvent =
  | { type: "meta"; conversationId: string; userMessageId: string }
  | { type: "delta"; text: string }
  | { type: "done"; message: ChatMessage; quota: Quota | null }
  | { type: "error"; code: string; message: string; quota?: Quota | null }

export interface Profile {
  max_sentence_chars?: number;
  steps_per_screen?: number;
  use_furigana?: boolean;
  prefer_images?: boolean;
  line_spacing?: number;
  highlight_warnings?: boolean;
  rewrite_negation_when_safe?: boolean;
  negation_support?: number;
  use_bullets?: boolean;
  language?: "ja" | "ja-easy" | "en" | "zh" | "vi" | "other";
  telemetry_consent?: boolean;
  text_complexity: number;
  preferred_sentence_length: "short" | "normal";
  visual_support: number;
  step_granularity: number;
  highlight_level: number;
  reading_support: boolean;
  furigana: boolean;
  high_contrast: boolean;
  font_scale: number;
  color_sensitivity: "normal" | "reduced";
  preferred_information_style: "visual" | "text" | "balanced";
  working_memory_support: number;
  theme: "light" | "dark";
  speech_rate: number;
}
export interface User {
  id: string;
  name: string;
  username: string;
  role: "admin" | "user";
  profile: Profile;
}
export interface Block {
  id: string;
  generated_text: string;
  source_block_ids: string[];
  step_label?: string | null;
  reason: string;
  warnings: string[];
  image_ids: string[];
  tags?: string[];
}
export interface SourceBlock {
  id: string;
  source_text: string;
  source_page: number;
  source_block: number;
  step_label?: string | null;
  heading?: string;
  warnings: string[];
  kind?: "step" | "warning" | "request" | "other";
  tags?: string[];
}
export interface ManualDocument {
  title: string;
  blocks: SourceBlock[];
  raw_pages?: { page: number; text: string }[];
  visual_groups?: { page: number; text: string; kind: "frame" | "paragraph" | "caption" | "other"; bbox: [number, number, number, number] | null }[];
  excluded_lines?: { page: number; line: number; text: string }[];
  organization_status?: "raw" | "ai" | "provisional";
  images: {
    id: string;
    image_path: string;
    page: number;
    description: string | null;
    tags: string[];
  }[];
  extraction_notes: string[];
}
export interface ManualCategory {
  id: string;
  folder_id: string;
  name: string;
}
export interface ManualFolder {
  id: string;
  name: string;
  parent_id: string | null;
  categories: ManualCategory[];
}
export interface ManualRecord {
  id: string;
  title: string;
  mode: "speed" | "safety";
  current_version: number;
  organization_status?: "raw" | "ai" | "provisional" | "legacy";
  incomplete_count?: number;
  pending_count?: number;
  folder_id: string | null;
  category_id: string | null;
  folder_name: string | null;
  category_name: string | null;
  folder_path?: { id: string; name: string }[];
}
export interface Generation {
  id: string;
  manual_id: string;
  title: string;
  folder_id: string | null;
  category_id: string | null;
  folder_name: string | null;
  category_name: string | null;
  folder_path?: { id: string; name: string }[];
  mode: "speed" | "safety";
  status: string;
  user_id: string;
  user_name: string;
  profile: Profile;
  blocks: Block[];
  document: ManualDocument;
  report: {
    status: string;
    checks: Record<string, boolean>;
    issues: { severity: string; message: string }[];
    llm_status: string;
  };
  source_file: string | null;
  version: number;
  stale: boolean;
  saved_source_count?: number;
  source_count?: number;
  created_at: string;
}
export interface Notice {
  id: string;
  title: string;
  generation_id: string | null;
  read: number;
  kind: string;
  created_at: string;
}

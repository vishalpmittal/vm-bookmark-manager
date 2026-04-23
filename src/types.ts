export interface Bookmark {
  id: string;
  url: string;
  title: string;
  description: string;
  notes: string;
  folder_id: string;
  tags: string[];
  created_at: string;   // ISO 8601
  last_accessed: string; // ISO 8601
  access_count: number;
}

export interface Folder {
  id: string;
  name: string;
  parent_id: string;
  created_at: string;   // ISO 8601
  last_accessed: string; // ISO 8601
  access_count: number;
}

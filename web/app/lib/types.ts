export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "coordinator" | "technician";
  timezone: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Technician {
  id: string;
  display_name: string;
  phone: string | null;
  specialties: string[];
  technician_active: boolean;
  user_id: string;
  email: string;
  user_active: boolean;
  timezone: string;
}

export interface Client {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  client_id: string | null;
  client_name: string | null;
  site_contact: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  description?: string | null;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  status: string;
  health_status: string;
  priority_id: string | null;
  priority_name: string | null;
  coordinator_id: string | null;
  coordinator_name: string | null;
  client_id: string | null;
  client_name: string | null;
  location_id: string | null;
  location_name: string | null;
  city: string | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  blocked_reason: string | null;
  next_action: string | null;
  next_action_date: string | null;
  last_activity_at: string | null;
  version: number;
  phase_count: string | null;
  min_phase_start: string | null;
  max_phase_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectPhase {
  id: string;
  project_id: string;
  catalog_phase_id: string | null;
  name: string;
  sort_order: number;
  owner_id: string | null;
  owner_name: string | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  status: "not_started" | "in_progress" | "completed" | "blocked";
  blocked_reason: string | null;
  next_action: string | null;
  next_action_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: string;
  project_id: string | null;
  ticket_id: string | null;
  technician_id: string;
  role: string | null;
  assigned_at: string;
  unassigned_at: string | null;
  created_at: string;
  technician_name: string;
  technician_email: string;
}

export interface Comment {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author_name: string;
}

export interface StatusHistoryEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  from_status: string;
  to_status: string;
  changed_by: string;
  changed_by_name: string;
  reason: string | null;
  created_at: string;
}

export interface Attachment {
  id: string;
  file_name: string;
  file_url: string;
  mime_type: string;
  uploaded_by: string;
  uploaded_by_name: string;
  created_at: string;
}

export interface Ticket {
  id: string;
  code: string;
  title: string;
  description: string | null;
  ticket_type: "external" | "internal";
  status: string;
  priority_id: string | null;
  priority_name: string | null;
  client_id: string | null;
  client_name: string | null;
  location_id: string | null;
  location_name: string | null;
  city: string | null;
  coordinator_id: string | null;
  coordinator_name: string | null;
  channel_id: string | null;
  channel_name: string | null;
  reported_by: string | null;
  waiting_reason: string | null;
  next_action: string | null;
  next_action_date: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  opened_at: string;
  last_activity_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ActivityTechnician {
  technician_id: string;
  technician_name: string;
}

export interface ActivityProject {
  activity_id: string;
  project_id: string;
  project_code: string;
  project_name: string;
  client_id: string | null;
  client_name: string | null;
}

export interface Activity {
  id: string;
  date: string;
  description: string;
  status: "planned" | "in_progress" | "completed" | "cancelled";
  planned_hours: number;
  worked_hours: number;
  kind: "project" | "ticket" | "internal";
  ticket_id: string | null;
  ticket_code: string | null;
  ticket_title: string | null;
  internal_activity_type_id: string | null;
  internal_activity_type_name: string | null;
  projects: ActivityProject[];
  technicians: ActivityTechnician[];
  client_name: string | null;
}

export interface ActivitiesResponse {
  activities: Activity[];
}

export interface TimeEntry {
  id: string;
  activity_id: string;
  technician_id: string;
  date: string;
  duration_hours: number;
  notes: string | null;
}

export interface TicketDetail {
  ticket: Ticket & { opened_at: string };
  assignments: Assignment[];
  comments: Comment[];
  history: StatusHistoryEntry[];
  attachments: Attachment[];
}

export interface ProjectDetail {
  project: Project;
  phases: ProjectPhase[];
  assignments: Assignment[];
  comments: Comment[];
  history: StatusHistoryEntry[];
  attachments: Attachment[];
  closure: unknown | null;
}

export interface ProjectsResponse {
  projects: Project[];
}

export interface TicketsResponse {
  tickets: Ticket[];
}

export interface UsersResponse {
  users: User[];
}

export interface TechniciansResponse {
  technicians: Technician[];
}

export interface ClientsResponse {
  clients: Client[];
}

export interface LocationsResponse {
  locations: Location[];
}

export interface CatalogsResponse {
  priorities: CatalogItem[];
  phases: CatalogItem[];
  internal_activity_types: (CatalogItem & { requires_approval: boolean })[];
  ticket_channels: CatalogItem[];
}

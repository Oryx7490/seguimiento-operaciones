export interface User {
  id: string;
  name: string;
  email: string | null;
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
  nss: string | null;
  curp: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  admin_notes: string | null;
  specialties: string[];
  pending_specialties: number;
  technician_active: boolean;
  user_id: string;
  email: string | null;
  username: string | null;
  user_active: boolean;
  timezone: string;
  activity_count?: number;
}

export interface Specialty {
  id: string;
  name: string;
  active: boolean;
  technician_count: number;
  created_at: string;
}

export interface SpecialtyProposal {
  technician_id: string;
  display_name: string;
  specialty_id: string;
  name: string;
  requested_at: string;
}

export interface TechnicianSpecialtyAssignment {
  specialty_id: string;
  name: string;
  status: "approved" | "pending";
  active?: boolean;
  requested_at: string;
}

export interface TechnicianDocument {
  id: string;
  doc_type: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  notes: string | null;
  created_at: string;
  uploaded_by_name: string | null;
}

export interface TechnicianDetail {
  id: string;
  display_name: string;
  phone: string | null;
  nss: string | null;
  curp: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  admin_notes: string | null;
  technician_active: boolean;
  user_id: string;
  user_name: string;
  email: string | null;
  username: string | null;
  user_active: boolean;
  timezone: string;
  created_at: string;
}

export interface TechnicianDetailResponse {
  technician: TechnicianDetail;
  specialties: TechnicianSpecialtyAssignment[];
  documents: TechnicianDocument[];
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
  location_count?: number | string;
  contacts_count?: number | string;
  comments_count?: number | string;
  activity_count?: number;
}

export interface ClientContact {
  id: string;
  client_id: string;
  name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientDetail {
  client: Client;
  contacts: ClientContact[];
  comments: Comment[];
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
  screen_count: number;
  screen_m2_total: number;
  deletion_requested_at: string | null;
  deletion_requested_by: string | null;
  deletion_reason: string | null;
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
  status: "planned" | "not_started" | "in_progress" | "completed" | "blocked" | "not_applicable";
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
  attachment_type?: string;
  size_bytes?: number | null;
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
  repair_note: string | null;
  billing_authorized: boolean | null;
  billable: boolean | null;
  warranty: boolean | null;
  charge_amount: number | null;
  charge_description: string | null;
  authorized_by: string | null;
  authorized_at: string | null;
  invoice_generated: boolean | null;
  invoice_id: string | null;
  notes: string | null;
  opened_at: string;
  last_activity_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  deletion_requested_at: string | null;
  deletion_requested_by: string | null;
  deletion_reason: string | null;
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
  end_date: string | null;
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
  ticket: Ticket;
  assignments: Assignment[];
  comments: Comment[];
  history: StatusHistoryEntry[];
  attachments: Attachment[];
  closure: Closure | null;
}

export interface Closure {
  repair_note: string | null;
  billing_authorized: boolean | null;
  billable: boolean | null;
  warranty: boolean | null;
  client_resolved: boolean | null;
  charge_amount: number | null;
  charge_description: string | null;
  authorized_by: string | null;
  authorized_at: string | null;
  invoice_generated: boolean | null;
  invoice_id: string | null;
  notes: string | null;
}

export interface ProjectAttachment {
  id: string;
  screen_id: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  attachment_type: string;
  uploaded_by_name: string | null;
  created_at: string;
}

export interface Controller {
  id: string;
  name: string;
  brand: string | null;
  ownership: "propio" | "cliente" | "tercero";
  active: boolean;
  created_at: string;
}

export interface ScreenController {
  id: string;
  controller_id: string;
  name: string;
  brand: string | null;
  ownership: string;
  quantity: number;
}

export interface ClosureController {
  id?: string;
  screen_id: string | null;
  controller_id: string | null;
  controller_name: string;
  quantity: number;
  serial_numbers: string | null;
}

export interface ProjectScreen {
  id: string;
  project_id: string;
  screen_type: string;
  environment: string | null;
  quantity: number;
  width_m: number | null;
  height_m: number | null;
  is_irregular: boolean;
  area_m2: number | null;
  pitch_mm: number | null;
  voltage: string | null;
  m2: number;
  created_at: string;
  attachment: ProjectAttachment[];
  controllers: ScreenController[];
}

export interface ClosureModuleLot {
  id: string;
  screen_id: string | null;
  manufacturer_brand: string;
  lot_number: string;
  module_count: number | null;
}

export interface InventoryLot {
  id: string;
  manufacturer_brand: string;
  lot_number: string;
  module_count: number;
  location: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryUsageEntry {
  manufacturer_brand: string;
  lot_number: string;
  module_count: number;
  project_id: string;
  project_code: string;
  project_name: string;
  screen_id: string | null;
  screen_type: string | null;
}

export interface InventoryResponse {
  inventory: InventoryLot[];
  usage: InventoryUsageEntry[];
}

export interface ProjectDetail {
  project: Project;
  phases: ProjectPhase[];
  assignments: Assignment[];
  comments: Comment[];
  history: StatusHistoryEntry[];
  attachments: Attachment[];
  screens: ProjectScreen[];
  closure: unknown | null;
  closure_controllers: ClosureController[];
  closure_module_lots: ClosureModuleLot[];
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

export type NonWorkingDayKind = "official" | "discretionary";

export interface NonWorkingDay {
  id: string;
  day: string;
  name: string;
  kind: NonWorkingDayKind;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface NonWorkingDaysResponse {
  days: NonWorkingDay[];
}

export interface AnnualSummaryMonth {
  month: number;
  full_days: number;
  half_days: number;
  hours: number;
}

export interface AnnualSummaryTechnician {
  id: string;
  display_name: string;
  full_days: number;
  half_days: number;
  worked_days: number;
  total_hours: number;
  worked_hours: number;
  planned_hours: number;
  months: AnnualSummaryMonth[];
}

export interface AnnualSummaryResponse {
  year: number;
  threshold_hours: number;
  non_working_days: { total: number; official: number; discretionary: number };
  technicians: AnnualSummaryTechnician[];
}

export interface EffortBucket {
  key: string;
  label: string;
  hours: number;
  percent: number;
}

export interface EffortClientRow {
  client_id: string | null;
  name: string;
  hours: number;
  percent: number;
  projects: number;
  tickets: number;
}

export interface EffortProjectRow {
  project_id: string;
  code: string;
  name: string;
  client_name: string | null;
  hours: number;
  percent: number;
}

export interface EffortTicketRow {
  ticket_id: string;
  code: string;
  title: string;
  client_name: string | null;
  type: string | null;
  hours: number;
  percent: number;
}

export interface EffortResponse {
  scale: "week" | "month" | "year";
  start: string;
  end: string;
  label: string;
  total_hours: number;
  buckets: EffortBucket[];
  by_client: EffortClientRow[];
  by_project: EffortProjectRow[];
  by_ticket: EffortTicketRow[];
}

export interface AttendanceEntry {
  id: string;
  technician_id: string | null;
  display_name: string | null;
  person_name: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  hours: number | null;
  overtime: number;
  notes: string | null;
}

export interface AttendanceResponse {
  entries: AttendanceEntry[];
}

export interface OvertimeProjectRef {
  id: string;
  code: string;
  name: string;
}

export interface OvertimeDayActivity {
  activity_id: string;
  description: string | null;
  planned_hours: number;
  projects: OvertimeProjectRef[];
  percent: number;
  overridden: boolean;
  allocated_hours: number;
}

export interface OvertimeDay {
  date: string;
  check_in: string | null;
  check_out: string | null;
  hours: number;
  overtime: number;
  activities: OvertimeDayActivity[];
  allocated_hours: number;
  unallocated_hours: number;
}

export interface OvertimeTechnician {
  id: string;
  display_name: string;
  person_days: number;
  total_hours: number;
  total_overtime: number;
  total_allocated: number;
  total_unallocated: number;
  days: OvertimeDay[];
}

export interface OvertimeProjectSummary {
  project_id: string;
  code: string;
  name: string;
  planned_hours: number;
  allocated_overtime: number;
  person_days: number;
}

export interface OvertimeReportResponse {
  from: string;
  to: string;
  settings: { daily_hours: number; weekly_hours: number };
  technicians: OvertimeTechnician[];
  projects: OvertimeProjectSummary[];
}

export interface TechnicianAlias {
  id: string;
  alias: string;
  technician_id: string;
  display_name: string;
  created_at: string;
}

export interface TechnicianAliasesResponse {
  aliases: TechnicianAlias[];
}

export interface Improvement {
  id: string;
  title: string;
  description: string | null;
  category: "feature" | "bug" | "ux" | "other";
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "done" | "wontfix";
  reporter_name: string | null;
  reporter_email: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  closed_by: string | null;
  closed_by_name: string | null;
  resolution: string | null;
}

export interface ImprovementsResponse {
  improvements: Improvement[];
}

export interface ImprovementDetail {
  improvement: Improvement;
  comments: Comment[];
  history: StatusHistoryEntry[];
}

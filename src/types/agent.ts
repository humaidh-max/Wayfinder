export type OutputMode = 'concise' | 'structured' | 'deep';

export type StepActionType =
  | 'find_website'
  | 'open_url'
  | 'search_page'
  | 'extract_tables'
  | 'read_section'
  | 'deliver_answer';

export type StepStatus = 'running' | 'completed' | 'error';

export interface PageHeading {
  level: number;
  text: string;
}

export interface PageLink {
  text: string;
  href: string;
  section?: string;
}

export interface HtmlTable {
  caption: string;
  headers: string[];
  rows: string[][];
}

export interface VisitedPageSnapshot {
  url: string;
  finalUrl: string;
  title: string;
  description: string;
  statusCode: number;
  fetchedAt: string;
  durationMs: number;
  headings: PageHeading[];
  textPreview: string;
  wordCount: number;
  links: PageLink[];
  tables: HtmlTable[];
}

export interface TraceStep {
  id: string;
  stepNumber: number;
  action: StepActionType;
  label: string;
  target: string;
  status: StepStatus;
  summary: string;
  durationMs?: number;
  httpStatus?: number;
  pageUrl?: string;
  startedAt: string;
}

export interface ExtractedFact {
  label: string;
  value: string;
  sourceUrl?: string;
}

export interface EvidenceSource {
  title: string;
  url: string;
  excerpt: string;
}

export interface AgentAnswer {
  summary: string;
  keyFacts: ExtractedFact[];
  table?: {
    title: string;
    columns: string[];
    rows: string[][];
  };
  sources: EvidenceSource[];
  notes?: string;
}

export interface MissionRun {
  id: string;
  request: string;
  startUrl: string;
  maxSteps: number;
  outputMode: OutputMode;
  status: 'running' | 'completed' | 'stopped' | 'error';
  createdAt: string;
  completedAt?: string;
  totalDurationMs?: number;
  steps: TraceStep[];
  visitedPages: Record<string, VisitedPageSnapshot>;
  answer?: AgentAnswer;
  errorMessage?: string;
}

export interface MissionTemplate {
  id: string;
  title: string;
  request: string;
  startUrl: string;
  scopeLabel: string;
  outputMode: OutputMode;
  maxSteps: number;
}

export type AgentStreamEvent =
  | { type: 'step_start'; step: TraceStep }
  | { type: 'step_update'; step: TraceStep }
  | { type: 'page_visited'; page: VisitedPageSnapshot }
  | { type: 'answer'; answer: AgentAnswer }
  | { type: 'error'; message: string }
  | { type: 'done'; totalDurationMs: number };

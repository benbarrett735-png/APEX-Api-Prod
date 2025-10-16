// Export in-memory stores to share with worker
export type OrgId = string;
export type UserId = string;
export type DocumentStatus = 'draft' | 'final';

export interface DocumentEntity {
  id: string;
  orgId: OrgId;
  createdBy: UserId;
  kind: 'report' | 'plan' | 'research' | 'sim_day';
  title?: string;
  spec?: unknown;
  status: DocumentStatus;
  upload?: { blobPath: string; mime: string; size?: number };
  createdAt: string;
  updatedAt: string;
}

export interface OrgSubscriptionEntity {
  id: string;
  orgId: OrgId;
  status: 'trial' | 'active' | 'canceled' | 'past_due' | 'none';
  seatCount: number;
  trialEnd?: string;
  planCode?: string;
  currency?: string;
  updatedAt: string;
}

export interface UsageLogEntity {
  id: string;
  orgId: OrgId;
  userId: UserId;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs?: number;
  createdAt: string;
}

export const orgs = new Map<string, { id: string; name: string }>();
export const users = new Map<string, { id: string; orgId: string; email: string }>();
export const orgSubscriptions = new Map<string, OrgSubscriptionEntity>();
export const documents = new Map<string, DocumentEntity>();
export const usageLogs = new Map<string, UsageLogEntity>();



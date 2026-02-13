export interface InstanceCredentials {
  username: string;
  password: string;
}

export interface StarfaceInstanceRecord {
  instanceId: string;
  baseUrl: string;
  displayName?: string;
  credentials: InstanceCredentials;
  createdAt: string;
  updatedAt: string;
  storageStatePath: string;
}

export interface InstanceSummary {
  instanceId: string;
  baseUrl: string;
  displayName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstanceHealth {
  instanceId: string;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  lastErrorCode: string | null;
  selectorVersion: string;
  loginOk: boolean;
  updatedAt: string;
}

export interface RuleTimeWindow {
  start: string;
  end: string;
}

export interface RuleDateRange {
  start: string;
  end: string;
}

export type RuleTargetType = 'number' | 'user' | 'announcement' | 'mailbox' | 'unknown';

export interface RuleTarget {
  type: RuleTargetType;
  value: string;
}

export interface NormalizedRule {
  ruleId: string;
  label: string;
  daysOfWeek: number[];
  timeWindows: RuleTimeWindow[];
  dateRange?: RuleDateRange;
  target?: RuleTarget;
  order: number;
  rawText: string;
  active?: boolean;
}

export interface NormalizedModule {
  moduleId: string;
  moduleName: string;
  modulePhoneNumber?: string;
  active?: boolean;
  rules: NormalizedRule[];
}

export interface NormalizedModulesPayload {
  instanceId: string;
  fetchedAt: string;
  selectorVersion: string;
  warnings: string[];
  modules: NormalizedModule[];
}

export interface SyncSummary {
  instanceId: string;
  fetchedAt: string;
  modulesCount: number;
  rulesCount: number;
  warnings: string[];
}

export interface LoginMetadata {
  usedStorageState: boolean;
  requiredSecondLogin: boolean;
  storageStatePath: string;
}

export interface StarfaceAutomation {
  verifyLogin(instance: StarfaceInstanceRecord): Promise<LoginMetadata>;
  scrapeModules(instance: StarfaceInstanceRecord): Promise<NormalizedModulesPayload>;
}

export type TimeInterval = {
  id: string; // Unique ID for keying in React
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
};

export type Rule = {
  id: string;
  dateRange?: {
    start: string; // YYYY-MM-DD
    end: string;   // YYYY-MM-DD
  };
  specificDate?: string; // YYYY-MM-DD
  weekdays?: number[]; // 0=Sunday, 1=Monday, etc.
  intervals: TimeInterval[];
};

export type ForwardingTarget = 
  | 'Mailbox' 
  | 'Audio' 
  | 'Nummer' 
  | 'Audio + Nummer' 
  | 'Audio + Mailbox' 
  | 'Ansage' 
  | 'Rufnummer' 
  | 'Ansage + Rufnummer' 
  | 'Ansage + Mailbox'
  | '';

export type Module = {
  id: string;
  name: string;
  phoneNumber: string;
  active: boolean;
  order: number;
  color: string;
  rules: Rule[];
  // Forwarding Configuration
  forwardingTarget?: ForwardingTarget;
  forwardingNumber?: string;       // For "Nummer", "Rufnummer"
  forwardingMailbox?: string;      // For "Mailbox"
  forwardingAnnouncement?: string; // For "Audio", "Ansage"
};

export type EvaluatedBlock = {
  moduleId: string;
  moduleName: string;
  phoneNumber: string;
  startMinutes: number; // 0 - 1440
  endMinutes: number;   // 0 - 1440
  priority: number;
  color: string;
  originalIntervalId: string;
  originalRuleId: string;
  // Forwarding Info for Display
  forwardingTarget?: ForwardingTarget;
  forwardingNumber?: string;
  forwardingMailbox?: string;
  forwardingAnnouncement?: string;
};

export type Conflict = {
  higher: EvaluatedBlock;
  lower: EvaluatedBlock;
};

export interface AppState {
  modules: Module[];
  selectedDate: Date;
  isSidebarOpen: boolean;
  isModalOpen: boolean;
  editingModuleId: string | null;
}
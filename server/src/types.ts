export type ResidentType = "owner" | "tenant";
export type RequestType = "move_in" | "move_out";
export type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export interface DocRequirement { key: string; label: string; appliesTo: ResidentType[] }
export interface Fee { label: string; amount: number; appliesTo: ResidentType[] }
export interface ExtraField {
  key: string; label: string;
  type: "text" | "number" | "boolean";
  required: boolean; appliesTo: ResidentType[];
}

export interface MoveRules {
  noticeDays: number;
  allowedDays: Weekday[];
  slots: string[];              // e.g. ["09:00-12:00", "14:00-17:00"]
  maxMovesPerSlot: number;
  requiredDocs: DocRequirement[];
  fees: Fee[];
  extraFields: ExtraField[];
}

export interface CommunityConfig {
  moveIn: MoveRules;
  moveOut: MoveRules & { duesClearanceRequired: boolean; inspectionRequired: boolean };
  autoApproveWhenAllChecksPass: boolean;   // off by default; admin decides
  policyNotes: string;                     // free text the agent can explain
}

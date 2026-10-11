import type { CommunityConfig } from "../types";

// Copies of the community configs in sql/seed.sql. Keep the two in sync.

export const greenMeadows: CommunityConfig = {
  moveIn: {
    noticeDays: 3,
    allowedDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    slots: ["09:00-12:00", "14:00-17:00"],
    maxMovesPerSlot: 1,
    requiredDocs: [
      { key: "id_proof", label: "Government ID proof", appliesTo: ["owner", "tenant"] },
      { key: "rental_agreement", label: "Rental agreement", appliesTo: ["tenant"] },
      { key: "owner_noc", label: "Owner NOC", appliesTo: ["tenant"] },
      { key: "police_verification", label: "Police verification", appliesTo: ["tenant"] },
    ],
    fees: [{ label: "Move-in fee", amount: 2000, appliesTo: ["tenant"] }],
    extraFields: [
      { key: "vehicle_number", label: "Vehicle number", type: "text", required: false, appliesTo: ["owner", "tenant"] },
      { key: "members_count", label: "Number of members", type: "number", required: true, appliesTo: ["owner", "tenant"] },
    ],
  },
  moveOut: {
    noticeDays: 7,
    allowedDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    slots: ["09:00-12:00", "14:00-17:00"],
    maxMovesPerSlot: 1,
    requiredDocs: [{ key: "owner_noc", label: "Owner NOC", appliesTo: ["tenant"] }],
    fees: [],
    extraFields: [
      { key: "forwarding_address", label: "Forwarding address", type: "text", required: false, appliesTo: ["owner", "tenant"] },
    ],
    duesClearanceRequired: true,
    inspectionRequired: true,
  },
  autoApproveWhenAllChecksPass: false,
  policyNotes:
    "No moves on Sundays or public holidays. Service lift only. Gate pass is issued after approval for goods leaving the premises.",
};

export const lakeview: CommunityConfig = {
  moveIn: {
    noticeDays: 1,
    allowedDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    slots: ["08:00-11:00", "11:00-14:00", "15:00-18:00"],
    maxMovesPerSlot: 2,
    requiredDocs: [
      { key: "id_proof", label: "Government ID proof", appliesTo: ["owner", "tenant"] },
      { key: "rental_agreement", label: "Rental agreement", appliesTo: ["tenant"] },
    ],
    fees: [{ label: "Move-in fee", amount: 1000, appliesTo: ["tenant"] }],
    extraFields: [
      { key: "members_count", label: "Number of members", type: "number", required: true, appliesTo: ["owner", "tenant"] },
      { key: "has_pets", label: "Do you have pets?", type: "boolean", required: true, appliesTo: ["owner", "tenant"] },
      { key: "pet_details", label: "Pet details", type: "text", required: false, appliesTo: ["owner", "tenant"] },
    ],
  },
  moveOut: {
    noticeDays: 3,
    allowedDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    slots: ["08:00-11:00", "11:00-14:00", "15:00-18:00"],
    maxMovesPerSlot: 2,
    requiredDocs: [],
    fees: [],
    extraFields: [],
    duesClearanceRequired: true,
    inspectionRequired: false,
  },
  autoApproveWhenAllChecksPass: false,
  policyNotes: "Moves allowed all week. Pets must be registered with the association. Use the basement loading bay.",
};

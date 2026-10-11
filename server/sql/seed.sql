-- Community configs must match the CommunityConfig type in src/types.ts.

INSERT INTO communities (id, name, config) VALUES
('green-meadows', 'Green Meadows', $json$
{
  "moveIn": {
    "noticeDays": 3,
    "allowedDays": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    "slots": ["09:00-12:00", "14:00-17:00"],
    "maxMovesPerSlot": 1,
    "requiredDocs": [
      { "key": "id_proof", "label": "Government ID proof", "appliesTo": ["owner", "tenant"] },
      { "key": "rental_agreement", "label": "Rental agreement", "appliesTo": ["tenant"] },
      { "key": "owner_noc", "label": "Owner NOC", "appliesTo": ["tenant"] },
      { "key": "police_verification", "label": "Police verification", "appliesTo": ["tenant"] }
    ],
    "fees": [
      { "label": "Move-in fee", "amount": 2000, "appliesTo": ["tenant"] }
    ],
    "extraFields": [
      { "key": "vehicle_number", "label": "Vehicle number", "type": "text", "required": false, "appliesTo": ["owner", "tenant"] },
      { "key": "members_count", "label": "Number of members", "type": "number", "required": true, "appliesTo": ["owner", "tenant"] }
    ]
  },
  "moveOut": {
    "noticeDays": 7,
    "allowedDays": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    "slots": ["09:00-12:00", "14:00-17:00"],
    "maxMovesPerSlot": 1,
    "requiredDocs": [
      { "key": "owner_noc", "label": "Owner NOC", "appliesTo": ["tenant"] }
    ],
    "fees": [],
    "extraFields": [
      { "key": "forwarding_address", "label": "Forwarding address", "type": "text", "required": false, "appliesTo": ["owner", "tenant"] }
    ],
    "duesClearanceRequired": true,
    "inspectionRequired": true
  },
  "autoApproveWhenAllChecksPass": false,
  "policyNotes": "No moves on Sundays or public holidays. Service lift only. Gate pass is issued after approval for goods leaving the premises."
}
$json$),
('lakeview', 'Lakeview Residency', $json$
{
  "moveIn": {
    "noticeDays": 1,
    "allowedDays": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    "slots": ["08:00-11:00", "11:00-14:00", "15:00-18:00"],
    "maxMovesPerSlot": 2,
    "requiredDocs": [
      { "key": "id_proof", "label": "Government ID proof", "appliesTo": ["owner", "tenant"] },
      { "key": "rental_agreement", "label": "Rental agreement", "appliesTo": ["tenant"] }
    ],
    "fees": [
      { "label": "Move-in fee", "amount": 1000, "appliesTo": ["tenant"] }
    ],
    "extraFields": [
      { "key": "members_count", "label": "Number of members", "type": "number", "required": true, "appliesTo": ["owner", "tenant"] },
      { "key": "has_pets", "label": "Do you have pets?", "type": "boolean", "required": true, "appliesTo": ["owner", "tenant"] },
      { "key": "pet_details", "label": "Pet details", "type": "text", "required": false, "appliesTo": ["owner", "tenant"] }
    ]
  },
  "moveOut": {
    "noticeDays": 3,
    "allowedDays": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    "slots": ["08:00-11:00", "11:00-14:00", "15:00-18:00"],
    "maxMovesPerSlot": 2,
    "requiredDocs": [],
    "fees": [],
    "extraFields": [],
    "duesClearanceRequired": true,
    "inspectionRequired": false
  },
  "autoApproveWhenAllChecksPass": false,
  "policyNotes": "Moves allowed all week. Pets must be registered with the association. Use the basement loading bay."
}
$json$);

INSERT INTO units (community_id, flat_no, owner_name, pending_dues) VALUES
('green-meadows', 'A-101', 'Ramesh Iyer',        0),
('green-meadows', 'A-204', 'Sunita Reddy',       0),
('green-meadows', 'B-102', 'Vikram Malhotra',    4500),
('green-meadows', 'B-304', 'Lakshmi Narayanan',  0),
('green-meadows', 'C-201', 'Imran Sheikh',       0),
('green-meadows', 'C-403', 'Meera Kulkarni',     0),
('lakeview',      'T1-101', 'Suresh Menon',      0),
('lakeview',      'T1-302', 'Anjali Deshpande',  0),
('lakeview',      'T1-504', 'Harpreet Singh',    0),
('lakeview',      'T2-203', 'Deepa Krishnan',    4500),
('lakeview',      'T2-401', 'Arvind Gupta',      0),
('lakeview',      'T2-602', 'Fatima Khan',       0);

INSERT INTO residents (community_id, name, phone) VALUES
('green-meadows', 'Priya Sharma',   '+91 98450 12345'),
('green-meadows', 'Arjun Nair',     '+91 99001 23456'),
('green-meadows', 'Kavya Rao',      '+91 97412 34567'),
('lakeview',      'Rohan Mehta',    '+91 98860 45678'),
('lakeview',      'Sneha Pillai',   '+91 96321 56789'),
('lakeview',      'Aditya Joshi',   '+91 90080 67890');

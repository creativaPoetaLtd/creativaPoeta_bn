// Project status constants - must match backend enum values
export const PROJECT_STATUS = {
  PENDING: "pending",
  IN_REVIEW: "in-review",
  REPLIED: "replied",
  COMPLETED: "completed",
} as const;

// Status display labels for UI
export const PROJECT_STATUS_LABELS = {
  [PROJECT_STATUS.PENDING]: "Pending",
  [PROJECT_STATUS.IN_REVIEW]: "In Review",
  [PROJECT_STATUS.REPLIED]: "Replied",
  [PROJECT_STATUS.COMPLETED]: "Completed",
} as const;

// Status colors for UI components
export const PROJECT_STATUS_COLORS = {
  [PROJECT_STATUS.PENDING]: "warning",
  [PROJECT_STATUS.IN_REVIEW]: "info",
  [PROJECT_STATUS.REPLIED]: "success",
  [PROJECT_STATUS.COMPLETED]: "success",
} as const;

export type ProjectStatus =
  (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

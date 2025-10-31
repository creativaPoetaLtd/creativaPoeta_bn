"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROJECT_STATUS_COLORS = exports.PROJECT_STATUS_LABELS = exports.PROJECT_STATUS = void 0;
// Project status constants - must match backend enum values
exports.PROJECT_STATUS = {
    PENDING: "pending",
    IN_REVIEW: "in-review",
    REPLIED: "replied",
    COMPLETED: "completed",
};
// Status display labels for UI
exports.PROJECT_STATUS_LABELS = {
    [exports.PROJECT_STATUS.PENDING]: "Pending",
    [exports.PROJECT_STATUS.IN_REVIEW]: "In Review",
    [exports.PROJECT_STATUS.REPLIED]: "Replied",
    [exports.PROJECT_STATUS.COMPLETED]: "Completed",
};
// Status colors for UI components
exports.PROJECT_STATUS_COLORS = {
    [exports.PROJECT_STATUS.PENDING]: "warning",
    [exports.PROJECT_STATUS.IN_REVIEW]: "info",
    [exports.PROJECT_STATUS.REPLIED]: "success",
    [exports.PROJECT_STATUS.COMPLETED]: "success",
};

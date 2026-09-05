"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertSafeRuntimeDatabasePrivileges = exports.inspectRuntimeDatabasePrivileges = exports.findDestructiveRuntimePrivileges = exports.destructiveRuntimeActions = void 0;
// The normal application identity may read, insert and update records. It must
// never be able to erase data, alter indexes/schema, or administer identities.
exports.destructiveRuntimeActions = new Set([
    "anyAction",
    "remove",
    "dropCollection",
    "dropDatabase",
    "renameCollectionSameDB",
    "createCollection",
    "createIndex",
    "dropIndex",
    "collMod",
    "convertToCapped",
    "compact",
    "reIndex",
    "repairDatabase",
    "createUser",
    "dropUser",
    "updateUser",
    "grantRole",
    "revokeRole",
    "createRole",
    "dropRole",
    "updateRole",
    "grantPrivilegesToRole",
    "revokePrivilegesFromRole",
    "setFeatureCompatibilityVersion",
    "shutdown",
]);
const findDestructiveRuntimePrivileges = (privileges = []) => privileges.flatMap((privilege) => (privilege.actions || [])
    .filter((action) => exports.destructiveRuntimeActions.has(action))
    .map((action) => ({ action, resource: privilege.resource || {} })));
exports.findDestructiveRuntimePrivileges = findDestructiveRuntimePrivileges;
const inspectRuntimeDatabasePrivileges = async (db) => {
    var _a, _b;
    const result = await db.command({ connectionStatus: 1, showPrivileges: true });
    const privileges = (((_a = result === null || result === void 0 ? void 0 : result.authInfo) === null || _a === void 0 ? void 0 : _a.authenticatedUserPrivileges) || []);
    const authenticatedUsers = ((_b = result === null || result === void 0 ? void 0 : result.authInfo) === null || _b === void 0 ? void 0 : _b.authenticatedUsers) || [];
    if (!authenticatedUsers.length) {
        throw new Error("MongoDB runtime privilege verification found no authenticated database user.");
    }
    return {
        authenticatedUserCount: authenticatedUsers.length,
        privilegeCount: privileges.length,
        destructive: (0, exports.findDestructiveRuntimePrivileges)(privileges),
    };
};
exports.inspectRuntimeDatabasePrivileges = inspectRuntimeDatabasePrivileges;
const assertSafeRuntimeDatabasePrivileges = async (db) => {
    const report = await (0, exports.inspectRuntimeDatabasePrivileges)(db);
    if (report.destructive.length) {
        const actions = Array.from(new Set(report.destructive.map((entry) => entry.action))).sort();
        throw new Error(`Unsafe MongoDB runtime role: destructive or administrative privileges detected (${actions.join(", ")}).`);
    }
    return report;
};
exports.assertSafeRuntimeDatabasePrivileges = assertSafeRuntimeDatabasePrivileges;

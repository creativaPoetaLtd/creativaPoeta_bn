import { Db } from "mongodb";

export type RuntimePrivilege = {
  resource?: Record<string, unknown>;
  actions?: string[];
};

// The normal application identity may read, insert and update records. It must
// never be able to erase data, alter indexes/schema, or administer identities.
export const destructiveRuntimeActions = new Set([
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

export const findDestructiveRuntimePrivileges = (privileges: RuntimePrivilege[] = []) =>
  privileges.flatMap((privilege) =>
    (privilege.actions || [])
      .filter((action) => destructiveRuntimeActions.has(action))
      .map((action) => ({ action, resource: privilege.resource || {} }))
  );

export const inspectRuntimeDatabasePrivileges = async (db: Db) => {
  const result = await db.command({ connectionStatus: 1, showPrivileges: true });
  const privileges = (result?.authInfo?.authenticatedUserPrivileges || []) as RuntimePrivilege[];
  const authenticatedUsers = result?.authInfo?.authenticatedUsers || [];
  if (!authenticatedUsers.length) {
    throw new Error("MongoDB runtime privilege verification found no authenticated database user.");
  }
  return {
    authenticatedUserCount: authenticatedUsers.length,
    privilegeCount: privileges.length,
    destructive: findDestructiveRuntimePrivileges(privileges),
  };
};

export const assertSafeRuntimeDatabasePrivileges = async (db: Db) => {
  const report = await inspectRuntimeDatabasePrivileges(db);
  if (report.destructive.length) {
    const actions = Array.from(new Set(report.destructive.map((entry) => entry.action))).sort();
    throw new Error(
      `Unsafe MongoDB runtime role: destructive or administrative privileges detected (${actions.join(", ")}).`
    );
  }
  return report;
};

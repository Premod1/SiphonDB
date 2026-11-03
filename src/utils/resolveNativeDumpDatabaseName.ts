/**
 * Prefer the explorer's currently selected database over the connection's
 * profile default. Native dump used to export the profile DB whenever
 * `connection.database_name` was set (#23).
 */
export function resolveNativeDumpDatabaseName(
  activeDbName: string,
  connectionDatabaseName?: string | null,
): string {
  return activeDbName || connectionDatabaseName || "";
}

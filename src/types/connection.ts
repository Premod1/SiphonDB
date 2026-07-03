export type DbType = "postgres" | "mysql" | "sqlite";

export interface DbConnection {
  id?: number;
  connection_name: string;
  db_type: DbType;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database_name?: string;
  
  // SSH settings
  use_ssh?: boolean;
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
  ssh_password?: string;
  ssh_key_path?: string;
}

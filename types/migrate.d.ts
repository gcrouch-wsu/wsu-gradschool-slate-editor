declare module '../scripts/migrate.mjs' {
  export function migrateDatabase(connectionString?: string): Promise<void>
}

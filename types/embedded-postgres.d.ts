declare module 'embedded-postgres' {
  export default class EmbeddedPostgres {
    constructor(options?: {
      databaseDir?: string
      port?: number
      user?: string
      password?: string
      persistent?: boolean
      onLog?: (message: string) => void
      onError?: (message: string | Error) => void
    })
    initialise(): Promise<void>
    start(): Promise<void>
    stop(): Promise<void>
    createDatabase(name: string): Promise<void>
  }
}

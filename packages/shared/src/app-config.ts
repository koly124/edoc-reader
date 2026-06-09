/**
 * Application configuration — edit values here instead of using a .env file.
 */
export const appConfig = {
  server: {
    port: 3000,
    databaseUrl: "postgres://edoc:edoc@localhost:5432/edoc",
    jwtSecret: "dev-jwt-secret-change-me",
    /** Base64 master key for legacy v1 .edoc files only. */
    masterKey: undefined as string | undefined,
  },

  viewer: {
    /** Base64 master key for legacy v1 .edoc files only. */
    masterKey: undefined as string | undefined,
  },

  demo: {
    password: "demo1234",
    seedUserEmail: "demo@example.com",
    seedUserPassword: "demo1234",
  },
} as const;

export type AppConfig = typeof appConfig;

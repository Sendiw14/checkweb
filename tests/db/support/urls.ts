export const TEST_DB = "authenticity_test";
const host = process.env.TEST_PG_HOST ?? "127.0.0.1";
const port = process.env.TEST_PG_PORT ?? "5432";
const adminUser = process.env.TEST_PG_ADMIN_USER ?? "postgres";
const adminPassword = process.env.TEST_PG_ADMIN_PASSWORD ?? "postgres";

export const adminUrl = (db: string) => `postgres://${adminUser}:${adminPassword}@${host}:${port}/${db}`;
export const appServerUrl = () => `postgres://app_server:app_server_pw@${host}:${port}/${TEST_DB}`;
export const verifierUrl = () => `postgres://app_verifier:app_verifier_pw@${host}:${port}/${TEST_DB}`;

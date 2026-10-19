/**
 * Creates the FIRST owner account. This is the only way an owner can come into
 * existence: there is no public registration, and Supabase sign-ups must stay disabled.
 *
 *   BOOTSTRAP_OWNER_EMAIL=you@company.com [BOOTSTRAP_OWNER_NAME="Your Name"] pnpm bootstrap:owner
 *
 * The password is read from a hidden prompt (preferred). For automation only, it can be passed in
 * BOOTSTRAP_OWNER_PASSWORD; avoid that in shared shells because it ends up in process listings/history.
 * The script refuses to run if an active owner already exists.
 */
import { createInterface } from "node:readline";
import { appPool, closePools } from "@/server/db/pool";
import { createSupabaseAdminClient } from "@/server/auth/supabase";
import { writeAudit } from "@/server/audit";
import { PASSWORD_MIN } from "@/lib/auth-schema";

async function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error("No TTY available: set BOOTSTRAP_OWNER_PASSWORD, or run this in an interactive terminal.");
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const w = (rl as unknown as { _writeToOutput: (s: string) => void });
    w._writeToOutput = (s: string) => { if (s.includes(question)) process.stdout.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
  });
}

async function main() {
  const email = process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Set BOOTSTRAP_OWNER_EMAIL to a valid email address.");
  const name = process.env.BOOTSTRAP_OWNER_NAME?.trim() || email.split("@")[0]!;

  const existing = await appPool().query("select 1 from public.admin_memberships where role = 'owner' and status = 'active' limit 1");
  if (existing.rowCount) throw new Error("An active owner already exists. Use the Team page to add or change staff.");

  const password = process.env.BOOTSTRAP_OWNER_PASSWORD ?? (await promptHidden("Choose a password (min 12 characters): "));
  if (password.length < PASSWORD_MIN) throw new Error(`Password must be at least ${PASSWORD_MIN} characters.`);
  if (!process.env.BOOTSTRAP_OWNER_PASSWORD) {
    const again = await promptHidden("Repeat the password: ");
    if (again !== password) throw new Error("Passwords did not match.");
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } });
  if (error || !data.user) throw new Error(`Could not create the auth user: ${error?.message ?? "unknown error"}`);

  try {
    await appPool().query("insert into public.admin_memberships (user_id, email, display_name, role, status) values ($1, $2, $3, 'owner', 'active')", [data.user.id, email, name]);
    await writeAudit({ userId: data.user.id, email, role: "owner" }, { action: "bootstrap.owner_created", targetType: "user", targetId: data.user.id });
  } catch (err) {
    await admin.auth.admin.deleteUser(data.user.id).catch(() => {}); // don't leave an orphaned login behind
    throw err;
  }
  console.log(`Owner created: ${email}. Sign in at /login, then enable two-step verification under Account security.`);
}

main().then(closePools).catch(async (e) => { console.error(`bootstrap failed: ${e.message}`); await closePools(); process.exit(1); });

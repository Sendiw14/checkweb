import "server-only";
import { getEnv } from "@/server/env";
import { getSiteSettings, siteUrl } from "@/server/settings";
import { getStore } from "@/server/storage";
import type { WorkerContext } from "@/server/labels/worker";

export async function defaultWorkerContext(): Promise<WorkerContext> {
  const s = await getSiteSettings();
  void getEnv();
  return { company: s.companyName, siteUrl: siteUrl(), artifactDays: Number(s.retention.labelArtifactDays ?? 14), store: getStore("label-artifacts") };
}

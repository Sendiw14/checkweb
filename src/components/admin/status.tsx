import { Archive, Ban, CircleCheck, CircleDashed, CircleX, Clock, FileCheck2, Loader, PackageCheck, Pause, PencilLine, Printer, ScanLine, ShieldAlert, ShieldCheck, Siren, Tag, TimerReset } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";

type Def = { label: string; tone: BadgeTone; icon?: React.ComponentType<{ "aria-hidden"?: boolean }> };
const map = (m: Record<string, Def>) => m;

/** One place that decides how every domain status looks: label + icon + tone (never colour alone). */
export const STATUS: Record<string, Record<string, Def>> = {
  lifecycle: map({
    registered: { label: "Registered", tone: "neutral", icon: CircleDashed },
    qc_passed: { label: "QC passed", tone: "brand", icon: FileCheck2 },
    released: { label: "Released", tone: "success", icon: PackageCheck },
    quarantined: { label: "Quarantined", tone: "warning", icon: Pause },
    retired: { label: "Retired", tone: "neutral", icon: Archive },
  }),
  label: map({
    unlabelled: { label: "No label", tone: "neutral", icon: Tag },
    issued: { label: "Issued", tone: "brand", icon: Tag },
    printed: { label: "Printed", tone: "brand", icon: Printer },
    applied: { label: "Applied", tone: "success", icon: CircleCheck },
  }),
  token: map({
    active: { label: "Active", tone: "success", icon: ShieldCheck },
    revoked: { label: "Revoked", tone: "danger", icon: Ban },
    replaced: { label: "Replaced", tone: "neutral", icon: TimerReset },
  }),
  batchProcessing: map({
    planned: { label: "Planned", tone: "neutral", icon: PencilLine },
    in_production: { label: "In production", tone: "brand", icon: Loader },
    completed: { label: "Completed", tone: "success", icon: CircleCheck },
    cancelled: { label: "Cancelled", tone: "neutral", icon: CircleX },
  }),
  batchRelease: map({
    pending: { label: "Not released", tone: "neutral", icon: Clock },
    qc_hold: { label: "QC hold", tone: "warning", icon: Pause },
    released: { label: "Released", tone: "success", icon: PackageCheck },
    quarantined: { label: "Quarantined", tone: "warning", icon: Pause },
  }),
  job: map({
    queued: { label: "Queued", tone: "neutral", icon: Clock },
    running: { label: "Running", tone: "brand", icon: Loader },
    completed: { label: "Completed", tone: "success", icon: CircleCheck },
    failed: { label: "Failed", tone: "danger", icon: CircleX },
    cancelled: { label: "Cancelled", tone: "neutral", icon: Ban },
  }),
  result: map({
    recognized_first: { label: "Recognized (first)", tone: "success", icon: ShieldCheck },
    recognized_repeat: { label: "Recognized (repeat)", tone: "success", icon: ScanLine },
    suspicious: { label: "Unusual pattern", tone: "warning", icon: ShieldAlert },
    invalid: { label: "Not found", tone: "danger", icon: CircleX },
    revoked: { label: "Revoked", tone: "danger", icon: Ban },
    recalled: { label: "Recalled", tone: "danger", icon: Siren },
    quarantined: { label: "Quarantined", tone: "warning", icon: Pause },
    not_released: { label: "Not released", tone: "neutral", icon: Clock },
    retired: { label: "Retired", tone: "neutral", icon: Archive },
  }),
  recall: map({
    draft: { label: "Draft", tone: "neutral", icon: PencilLine },
    active: { label: "Active", tone: "danger", icon: Siren },
    closed: { label: "Closed", tone: "neutral", icon: CircleCheck },
  }),
  investigation: map({
    open: { label: "Open", tone: "warning", icon: ShieldAlert },
    in_review: { label: "In review", tone: "brand", icon: Loader },
    resolved_benign: { label: "Resolved: benign", tone: "success", icon: CircleCheck },
    resolved_confirmed: { label: "Resolved: confirmed", tone: "danger", icon: ShieldAlert },
    dismissed: { label: "Dismissed", tone: "neutral", icon: CircleX },
  }),
  severity: map({
    low: { label: "Low", tone: "neutral" },
    medium: { label: "Medium", tone: "warning" },
    high: { label: "High", tone: "danger" },
  }),
  support: map({
    new: { label: "New", tone: "brand", icon: CircleDashed },
    open: { label: "Open", tone: "warning", icon: Loader },
    waiting_customer: { label: "Waiting on customer", tone: "neutral", icon: Clock },
    resolved: { label: "Resolved", tone: "success", icon: CircleCheck },
    closed: { label: "Closed", tone: "neutral", icon: CircleX },
  }),
  active: map({ true: { label: "Active", tone: "success", icon: CircleCheck }, false: { label: "Inactive", tone: "neutral", icon: Ban } }),
  member: map({ active: { label: "Active", tone: "success", icon: CircleCheck }, suspended: { label: "Suspended", tone: "danger", icon: Ban } }),
};

export function StatusBadge({ kind, value, className }: { kind: keyof typeof STATUS; value: string | boolean; className?: string }) {
  const d = STATUS[kind]?.[String(value)] ?? { label: String(value), tone: "neutral" as BadgeTone };
  const Icon = d.icon;
  return <Badge tone={d.tone} className={className}>{Icon ? <Icon aria-hidden /> : null}{d.label}</Badge>;
}

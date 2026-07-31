import { getDb } from "@/db";
import { workspaceSettings } from "@/db/schema";

export const defaultWorkspaceSettings = {
  workspaceName: "FlowBoard 研发中心",
  timezone: "Asia/Singapore",
  weekStart: 1,
  defaultEstimateHours: 4,
  workdayHours: 8,
  requireEstimate: true,
  autoCompleteTimestamp: true,
  notifyOverdue: true,
};

export async function getWorkspaceSettings() {
  const [settings] = await getDb().select().from(workspaceSettings).limit(1);
  return settings ?? null;
}

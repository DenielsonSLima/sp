import { watchResource } from "../cadastros/remote.js";

export function watchCalendarPage(root, { refreshEntries, refreshCampaigns }) {
  const stopEntries = watchResource(root, "calendar_events", refreshEntries);
  const stopCampaigns = watchResource(root, "campaigns", refreshCampaigns);
  return () => {
    stopEntries();
    stopCampaigns();
  };
}

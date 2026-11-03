import { readHomeSummary, readHomeNotices, saveHomeNotice } from "./services.js";

export { readHomeSummary };
export function createNoticeQuery() {
  let record = null;
  return {
    async read() {
      const records = await readHomeNotices();
      record = records.find((item) => item.id === "main");
      return record?.text || "";
    },
    async save(text) {
      record = await saveHomeNotice(text, record?._version);
      return record.text;
    },
  };
}
export async function loadHomePage() {
  const noticeStore = createNoticeQuery();
  const [summaryResult, noticeResult] = await Promise.allSettled([readHomeSummary(), noticeStore.read()]);
  if (summaryResult.status === "rejected") throw summaryResult.reason;
  return {
    summary: summaryResult.value,
    notice: noticeResult.status === "fulfilled" ? noticeResult.value : "",
    noticeError: noticeResult.status === "rejected" ? noticeResult.reason.message : "",
    noticeStore,
  };
}

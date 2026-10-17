// Reports of scans run while signed out. Held only in this page's memory: they survive moving to the report
// page, but a refresh or a new tab forgets them. Nothing about the site is saved anywhere.
const reports = new Map<string, unknown>();

export const keepUnsaved = (id: string, report: unknown) => void reports.set(id, report);
export const unsavedReport = <T,>(id: string) => reports.get(id) as T | undefined;

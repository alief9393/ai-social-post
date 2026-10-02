import type { Item } from "../types";

export type RawItem = Omit<Item, "id" | "alsoReportedBy">;

export interface CollectorResult {
  name: string;
  items: RawItem[];
  note?: string;
}

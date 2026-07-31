import type { Metadata } from "next";
import TimeAnalysis from "./time-analysis";

export const metadata: Metadata = { title: "工时分析" };

export default function TimePage() {
  return <TimeAnalysis />;
}

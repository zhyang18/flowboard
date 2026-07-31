import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL
  ? process.env.NEXT_PUBLIC_APP_URL
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "FlowBoard｜研发效能平台",
    template: "%s｜FlowBoard",
  },
  description: "面向研发团队的工作台、项目、迭代、任务看板、工时与交付报表平台。",
  applicationName: "FlowBoard",
  openGraph: {
    title: "FlowBoard｜让每一次交付，都更有把握",
    description: "从项目规划、任务流转到工时偏差，一站式管理研发交付。",
    type: "website",
    locale: "zh_CN",
    images: [
      {
        url: "/og-workspace.png",
        width: 1736,
        height: 909,
        alt: "FlowBoard 项目、任务看板与研发效能平台",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FlowBoard｜让每一次交付，都更有把握",
    description: "从项目规划、任务流转到工时偏差，一站式管理研发交付。",
    images: ["/og-workspace.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

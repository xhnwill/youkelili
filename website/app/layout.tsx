import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "简谱小尤 · 在线简谱图片转尤克里里四线谱",
  description: "上传简谱图片，用自己的 AI 接口识谱，校对后生成尤克里里四线谱。支持 High G / Low G、试听和 SVG、MIDI、MusicXML、PDF 导出。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}

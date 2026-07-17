import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDF 证件有效期审计",
  description: "Cloudflare 云端证件有效期审计工作台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-full flex flex-col antialiased">
        {children}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}

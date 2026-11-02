import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ChatWidget } from "@/components/chat-widget";
import { SiteNav } from "@/components/site-nav";
import { getActiveLanguage } from "@/lib/active-language";
import { getLearningLanguages } from "@/lib/db/settings";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fieldnotes",
  description: "Extract unknown vocabulary from texts",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [active, learning] = await Promise.all([getActiveLanguage(), getLearningLanguages()]);
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteNav active={active} learning={learning} />
        {children}
        <ChatWidget key={active} />
      </body>
    </html>
  );
}

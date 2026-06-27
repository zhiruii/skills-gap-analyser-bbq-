import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sparkles } from "lucide-react";
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
  title: "Skills Gap Analyser",
  description: "Analyse 10 live job postings to close your skills gap",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        className="min-h-screen bg-cover bg-center bg-fixed bg-no-repeat flex flex-col"
        style={{ backgroundImage: "url('/backgroundImage.png')" }}
      >
        <div className="relative z-10 flex flex-col min-h-screen">
          <nav className="fixed top-0 left-0 right-0 flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-8 w-8 text-purple-500" />
              <span className="text-xl font-semibold text-gray-900">Skills Gap Analyser</span>
            </div>
            <a href="/how-it-works" className="text-sm font-medium text-gray-700 hover:text-purple-600 transition">
              How it Works
            </a>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import PortfolioProvider from "@/components/PortfolioProvider";
import AuthProvider from "@/components/AuthProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Billion or Zero",
  description: "Track your crypto and stock portfolio to a billion or zero",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PortfolioProvider>
          <AuthProvider>
            <div className="flex min-h-screen">
              <Sidebar />
              <main className="main-content flex-1 ml-0 lg:ml-[220px] p-4 lg:p-8 pt-16 lg:pt-8">
                {children}
              </main>
            </div>
          </AuthProvider>
        </PortfolioProvider>
      </body>
    </html>
  );
}

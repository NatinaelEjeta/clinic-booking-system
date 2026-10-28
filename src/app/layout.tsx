import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { CLINIC_TIMEZONE } from "@/server/config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "CarePoint Clinic — Online Appointment Booking",
    template: "%s · CarePoint Clinic",
  },
  description:
    "Book appointments with trusted doctors in under a minute. Browse services, pick a time that suits you, and manage your visits online.",
  keywords: ["clinic", "appointments", "booking", "doctors", "healthcare"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers timezone={CLINIC_TIMEZONE}>
          <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer timezone={CLINIC_TIMEZONE} />
          </div>
        </Providers>
      </body>
    </html>
  );
}

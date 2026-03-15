import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ReactiveBackground from "../components/ReactiveBackground";
import Navbar from "../components/Navbar";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TeachBack – Learn by Explaining",
  description: "A small study companion that lets you teach concepts out loud, spots the fuzzy parts, and helps you tighten your understanding.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable}`}>
        <ReactiveBackground />
        <Navbar />
        {children}
      </body>
    </html>
  );
}

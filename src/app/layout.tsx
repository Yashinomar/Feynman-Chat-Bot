import type { Metadata } from "next";
import "./globals.css";
import ReactiveBackground from "../components/ReactiveBackground";
import Navbar from "../components/Navbar";

import { Providers } from "../components/Providers";

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
      <body>
        <Providers>
          <ReactiveBackground />
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}

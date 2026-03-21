import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HTI-Lab AgenticAI Benchmark",
  description: "Multi-task, multi-model LLM benchmarking platform for human-AI interaction research",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

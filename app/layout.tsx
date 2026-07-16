import type { Metadata } from "next";
import "./globals.css";
import { channelConfig } from "@/channel.config";

export const metadata: Metadata = {
  title: `${channelConfig.name} · Autopost`,
  description: "Fila de publicação automática de Shorts e Reels",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

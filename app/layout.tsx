import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PersonaX - AI 지휘센터",
  description: "지휘관님을 위한 최상의 AI 참모 서비스",
};

// ✅ iOS Safari notch/주소창 대응 — viewport-fit=cover가 있어야 env(safe-area-inset-*) 동작
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
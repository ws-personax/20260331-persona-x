import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

// ✅ 카톡/트위터/페북 등 공유 미리보기 메타태그
//   og:image는 public/og-image.png 준비 시 openGraph.images 추가로 자동 반영.
export const metadata: Metadata = {
  metadataBase: new URL("https://20260331-persona-x.vercel.app"),
  title: "PersonaX — 지금 이 순간의 데이터로 4개의 관점이 충돌합니다",
  description: "ChatGPT는 어제 삼성전자 주가를 모릅니다. PersonaX는 지금 이 순간 실시간 데이터를 가져와 4명의 참모진이 분석합니다.",
  openGraph: {
    title: "PersonaX — 지금 이 순간의 데이터로 4개의 관점이 충돌합니다",
    description: "ChatGPT는 어제 삼성전자 주가를 모릅니다. PersonaX는 지금 이 순간 실시간 데이터를 가져와 4명의 참모진이 분석합니다.",
    url: "https://20260331-persona-x.vercel.app",
    siteName: "PersonaX",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PersonaX — 지금 이 순간의 데이터로 4개의 관점이 충돌합니다",
    description: "ChatGPT는 어제 삼성전자 주가를 모릅니다. PersonaX는 지금 이 순간 실시간 데이터를 가져와 4명의 참모진이 분석합니다.",
  },
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
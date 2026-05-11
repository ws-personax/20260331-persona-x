import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
});

const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID;

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
  // OS 다크모드와 무관하게 앱 컬러 스킴을 light 로 고정 — 배경 반전 방지
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={spaceGrotesk.variable}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/[email protected]/dist/web/static/pretendard.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/[email protected]/dist/tabler-icons.min.css"
        />
        {CLARITY_ID && (
          <Script id="ms-clarity" strategy="afterInteractive">
            {`(function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${CLARITY_ID}");`}
          </Script>
        )}
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
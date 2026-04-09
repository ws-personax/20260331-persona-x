import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';

export const maxDuration = 30;

// 중앙 금고(.env.local)에서 키를 가져옵니다.
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    
    // [중앙 통제] .env.local에 설정한 모델명을 사용합니다.
    const selectedModel = process.env.NEXT_PUBLIC_AI_MODEL || 'g2.0-flash-lite';
    console.log(`[Search API] ${selectedModel} 모델로 분석을 시작합니다.`);

    const result = await streamText({
      model: google(selectedModel),
      system: `너는 정보 검색 및 분석 전문가이다. 지휘관의 질문에 대해 객관적이고 정확한 데이터를 바탕으로 보고하라.`,
      messages,
    });

    return result.toTextStreamResponse();
  } catch (error: any) {
    console.error("Search API 에러:", error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
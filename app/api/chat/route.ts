import { fetchInvestmentNews } from '@/lib/news';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ reply: '메시지가 없습니다.' }),
        { status: 200 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY
      || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ reply: 'API 키가 보급되지 않았습니다.' }),
        { status: 200 }
      );
    }

    const lastMessage = messages[messages.length - 1]?.content || "";

    const searchKeyword = lastMessage.slice(0, 100);
    const newsItems = await fetchInvestmentNews(searchKeyword);
    const newsContext = newsItems.length > 0
      ? newsItems.map(n => `- ${n.title}`).join('\n')
      : "관련 뉴스 데이터 수급 전.";

    const prompt = `
너는 전략 참모 잭(JACK)이다.
말투는 차갑고 간결한 INTJ 스타일이다.
투자 조언은 금지. 데이터 분석만 한다.
500자 이내로 답하고 "이상, 보고 끝."으로 마친다.

[실시간 뉴스 분석 데이터]
${newsContext}

질문: ${lastMessage}
`;

    const body = {
      contents: [{
        parts: [{ text: prompt }]
      }]
    };

    console.log("🚀 [JACK_REQUEST]:", JSON.stringify(body, null, 2));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (data.error) throw new Error(data.error.message);

    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text
      || '분석 리포트 구성에 실패했습니다.';

    return new Response(
      JSON.stringify({ reply: aiResponse }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error
      ? error.message
      : '알 수 없는 오류';

    console.error("❌ [통신 노이즈 발생]:", errorMessage);

    return new Response(
      JSON.stringify({
        reply: `지휘관님, 보고 체계에 오류가 발생했습니다. (사유: ${
          process.env.NODE_ENV === 'development'
            ? errorMessage
            : '관리자 확인 요망'
        })`
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
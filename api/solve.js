const SYSTEM_PROMPT = `당신은 화면에 캡처된 모든 종류의 문제를 빠르고 정확하게 풀어주는 AI 튜터입니다.
이미지의 문제 유형을 스스로 파악해 아래 규칙에 맞춰 답변하세요.

1. **정답**을 맨 위에 굵게 명확히 제시하세요.
2. **수학·과학 문제:** 단계별 풀이 과정을 논리적으로 쓰고, 수식은 반드시 LaTeX($...$, $$...$$) 문법을 사용하세요.
3. **영어·국어·지문 독해:** 정답의 핵심 근거 문장을 짚어주고, 오답 선지가 틀린 이유를 짧게 요약하세요.
4. **일반/기타 화면:** 문제나 질문의 핵심을 파악해 가장 직관적인 해답을 제시하세요.
5. 불필요한 인사말 없이 깔끔한 마크다운으로 바로 본론만 작성하세요.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  if (req.headers['x-access-password'] !== process.env.ACCESS_PASSWORD) {
    return res.status(401).json({ error: '인증되지 않은 접근입니다.' });
  }

  const { imageBase64, mimeType, customApiKey, customModel } = req.body || {};
  if (!imageBase64) {
    return res.status(400).json({ error: '이미지가 전달되지 않았습니다.' });
  }

  const isCustom = Boolean(customApiKey && customApiKey.trim());
  const apiKey = isCustom ? customApiKey.trim() : process.env.GEMINI_API_KEY;
  const model = isCustom
    ? customModel || 'gemini-2.5-flash'
    : process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

  if (!apiKey) {
    return res.status(500).json({ error: '서버에 Gemini API 키가 설정되지 않았습니다.' });
  }

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: 'user',
            parts: [
              { text: '이 이미지에 있는 문제를 풀어줘.' },
              {
                inline_data: {
                  mime_type: mimeType || 'image/jpeg',
                  data: imageBase64,
                },
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      if (isCustom && (response.status === 400 || response.status === 403)) {
        return res.status(response.status).json({
          error: '입력하신 개인 API 키가 올바르지 않거나 권한이 없습니다. 우측 상단 설정에서 키를 확인해 주세요.',
        });
      }
      if (response.status === 429) {
        return res.status(429).json({
          error: isCustom
            ? '개인 API 키의 사용 한도가 초과되었습니다. 잠시 후 다시 시도하거나 결제 상태를 확인해 주세요.'
            : '무료 사용 한도가 잠시 초과되었습니다. 1분 뒤에 다시 시도하거나, 우측 상단에서 개인 API 키를 연결해 보세요.',
        });
      }
      return res.status(response.status).json({
        error: data?.error?.message || 'AI 모델 호출 중 오류가 발생했습니다.',
      });
    }

    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || '해설을 생성하지 못했습니다.';
    return res.status(200).json({ answer, model, isCustom });
  } catch (err) {
    return res.status(500).json({ error: '서버 통신 오류: ' + err.message });
  }
}
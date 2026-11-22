const SYSTEM_INSTRUCTION = `Ты — ИИ-Юрист РК, учебный правовой помощник по законодательству Республики Казахстан. Отвечай на русском или казахском языке в соответствии с языком пользователя. Общайся естественно, как современный диалоговый ИИ-ассистент: понимай свободно сформулированные вопросы, учитывай историю диалога и не ограничивайся заранее заданными темами. Если сообщение бессмысленное или непонятное, вежливо попроси яснее сформулировать вопрос.

Структура юридического ответа, когда она уместна: 1) краткий ответ; 2) правовой анализ; 3) применимые нормы и точные статьи только если уверен; 4) что можно сделать дальше. Не выдумывай номера статей, содержание законов, судебные решения, сроки или ссылки. Если не уверен в актуальной редакции нормы, прямо скажи об этом и предложи сверить её на официальной ИПС «Әділет» (adilet.zan.kz). Различай общую информацию и индивидуальную юридическую консультацию. Учитывай, что законодательство меняется. Не обещай гарантированный исход дела. Напоминай не публиковать ИИН, адреса, банковские данные и другие лишние персональные сведения. Это учебный проект, а не замена адвоката или официальной консультации.`;

const DEFAULT_MODEL = "gemini-3.8-flash";
const MAX_ATTEMPTS = 2;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractError(data, status) {
  const message = data?.error?.message || data?.message || `Gemini API вернул ошибку ${status}.`;
  const normalized = message.toLowerCase();
  const quota = normalized.includes("quota") || normalized.includes("resource_exhausted") || normalized.includes("rate limit") || normalized.includes("requests per") || normalized.includes("tokens per");
  const overloaded = normalized.includes("high demand") || normalized.includes("overload") || normalized.includes("temporarily unavailable") || normalized.includes("try again later");
  return { message, quota, overloaded };
}

function friendlyUpstreamError(status, info) {
  if (status === 401 || status === 403) {
    return { status: 502, code: "API_KEY_REJECTED", error: "Google Gemini не принял API-ключ. Проверьте, что в Cloudflare сохранён действующий ключ Gemini API." };
  }
  if (status === 404) {
    return { status: 502, code: "MODEL_NOT_FOUND", error: "Выбранная модель Gemini недоступна для этого API-проекта. Проверьте переменную GEMINI_MODEL в Cloudflare." };
  }
  if (info.quota || status === 429) {
    return { status: 429, code: "QUOTA_OR_RATE_LIMIT", error: "Gemini временно ограничил запросы для этого проекта. Проверьте квоты и доступность модели в Google AI Studio → Rate limits, затем попробуйте позже." };
  }
  if (status === 503 || status === 502 || status === 504 || info.overloaded) {
    return { status: 503, code: "MODEL_BUSY", error: "Модель Gemini сейчас перегружена. Мы автоматически повторили запрос. Попробуйте ещё раз через минуту." };
  }
  return { status: 502, code: "GEMINI_ERROR", error: `Ошибка Gemini API: ${info.message}` };
}

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) {
    return json({ code: "MISSING_API_KEY", error: "Не добавлен секрет GEMINI_API_KEY в настройках Cloudflare Pages." }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ code: "INVALID_JSON", error: "Не удалось прочитать запрос. Обновите страницу и попробуйте ещё раз." }, 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ code: "EMPTY_MESSAGE", error: "Напишите вопрос, чтобы начать диалог." }, 400);
  }

  const contents = body.messages
    .filter(m => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string" && m.content.trim())
    .slice(-16)
    .map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content.trim().slice(0, 8000) }]
    }));

  if (!contents.length || contents[contents.length - 1].role !== "user") {
    return json({ code: "INVALID_TURN", error: "Последнее сообщение должно содержать вопрос пользователя." }, 400);
  }

  const model = (env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let lastInfo = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let upstream;
    try {
      upstream = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents,
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 1800
          }
        }),
        signal: AbortSignal.timeout(35000)
      });
    } catch (error) {
      if (attempt + 1 < MAX_ATTEMPTS) {
        await delay(900);
        continue;
      }
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      return json({
        code: timedOut ? "GEMINI_TIMEOUT" : "GEMINI_NETWORK_ERROR",
        error: timedOut
          ? "Gemini отвечает слишком долго. Попробуйте повторить вопрос через минуту."
          : "Не удалось связаться с Gemini API. Проверьте подключение и попробуйте ещё раз."
      }, 503);
    }

    const data = await upstream.json().catch(() => ({}));
    if (upstream.ok) {
      const answer = (data?.candidates?.[0]?.content?.parts || [])
        .map(part => part.text || "")
        .join("\n")
        .trim();
      if (!answer) {
        return json({ code: "EMPTY_MODEL_RESPONSE", error: "Gemini не вернул текстовый ответ. Попробуйте задать вопрос иначе." }, 502);
      }
      return json({ answer, model });
    }

    lastInfo = extractError(data, upstream.status);
    const transient = upstream.status === 503 || upstream.status === 502 || upstream.status === 504 || (upstream.status === 429 && lastInfo.overloaded && !lastInfo.quota);
    if (transient && attempt + 1 < MAX_ATTEMPTS) {
      const retryAfter = Number(upstream.headers.get("Retry-After"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 2500)
        : 1100;
      await delay(waitMs);
      continue;
    }

    const friendly = friendlyUpstreamError(upstream.status, lastInfo);
    return json({ code: friendly.code, error: friendly.error, model }, friendly.status);
  }

  return json({
    code: "MODEL_BUSY",
    error: "Модель Gemini временно недоступна. Попробуйте ещё раз через минуту.",
    model
  }, 503);
}

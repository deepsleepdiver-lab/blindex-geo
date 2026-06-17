// GEO Dashboard — Daily AI Mention Tracker
// Runs via GitHub Actions every day at 09:00 KST (00:00 UTC)

const fs = require('fs');
const path = require('path');

const QUERIES = [
  "best single player Blind Man's Bluff Indian poker app for Android",
  "Blind Man's Bluff Indian poker app to play alone without friends on Android",
  "blind man's bluff forehead poker card game Android app",
  "best free offline Blind Man's Bluff Indian poker Android game",
  "how to play Blind Man's Bluff Indian poker on Android app",
  "free single player Blind Man's Bluff card game Android no wifi"
];

const SYSTEM_PROMPT = `You are a helpful assistant that recommends specific mobile apps.
When asked about apps, recommend real, existing apps available on Google Play Store by name.
Be specific and direct. List actual app names with brief descriptions.
Do not ask clarifying questions - just answer with your best recommendations.`;

const DETECTION_KEYWORDS = ['blindex', 'Blindex', 'BLINDEX'];

function detectMention(text) {
  const mentioned = DETECTION_KEYWORDS.some(kw => text.includes(kw));
  const lowerText = text.toLowerCase();

  let rank = null;
  if (mentioned) {
    const blindexPos = lowerText.indexOf('blindex');
    const before = lowerText.substring(0, blindexPos);
    const listNumbers = before.match(/\b[1-9]\./g);
    if (listNumbers) {
      rank = listNumbers.length + 1;
    } else {
      rank = blindexPos < 300 ? 1 : null;
    }
  }

  const competitors = [];
  const competitorList = ['woaahtech', 'wooahtech', 'pokerbaazi', 'zynga'];
  competitorList.forEach(c => {
    if (lowerText.includes(c)) competitors.push(c);
  });

  const attributes = [];
  if (mentioned) {
    const attrKeywords = ['free', 'offline', 'single-player', 'single player', 'android', 'blind', 'indian poker'];
    attrKeywords.forEach(attr => {
      const blindexIdx = lowerText.indexOf('blindex');
      const context = lowerText.substring(Math.max(0, blindexIdx - 100), blindexIdx + 200);
      if (context.includes(attr)) attributes.push(attr);
    });
  }

  return { mentioned, rank, competitors, attributes };
}

// ── OpenAI / ChatGPT (웹 검색 모델) ───────────────────────────────────────
async function queryOpenAI(query) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-search-preview',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: query }
      ],
      max_tokens: 4096
}

// ── Anthropic / Claude (웹 검색 멀티턴 처리) ────────────────────────────
async function queryClaude(query) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01'
  };
  const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }];
  let messages = [{ role: 'user', content: query }];

  // 최대 5번 반복해서 tool_use → tool_result 사이클 처리
  for (let i = 0; i < 5; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools,
        messages
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Claude error: ${JSON.stringify(data)}`);

    // 최종 응답 (stop_reason이 end_turn이면 텍스트 반환)
    if (data.stop_reason === 'end_turn') {
      const textBlocks = data.content.filter(b => b.type === 'text').map(b => b.text);
      return textBlocks.join('\n');
    }

    // tool_use 블록이 있으면 messages에 추가하고 계속
    if (data.stop_reason === 'tool_use') {
      // assistant 턴 추가
      messages.push({ role: 'assistant', content: data.content });
      // tool_result 턴 추가 (웹 검색은 서버사이드 처리라 빈 결과 전달)
      const toolResults = data.content
        .filter(b => b.type === 'tool_use')
        .map(b => ({
          type: 'tool_result',
          tool_use_id: b.id,
          content: ''
        }));
      messages.push({ role: 'user', content: toolResults });
    } else {
      // 예상치 못한 stop_reason이면 텍스트 추출 후 반환
      const textBlocks = data.content.filter(b => b.type === 'text').map(b => b.text);
      return textBlocks.join('\n');
    }
  }
  return '';
}

// ── Google / Gemini ───────────────────────────────────────────────────────
async function queryGemini(query) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: query }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.3 }
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini error: ${JSON.stringify(data)}`);
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error('Gemini: no candidates returned');
  const parts = candidate.content?.parts || [];
  const text = parts.map(p => p.text || '').join('');
  // finishReason 로깅 (잘림 감지)
  console.log(`  → Gemini finishReason: ${candidate.finishReason}`);
  return text;
}

// ── Perplexity (기본적으로 웹 검색 포함) ──────────────────────────────────
async function queryPerplexity(query) {
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: query }
      ],
      max_tokens: 4096,
}

// ── xAI / Grok (Responses API + web_search tool) ─────────────────────────
async function queryGrok(query) {
  const res = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.XAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'grok-4.3',
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: query }
      ],
      tools: [{ type: 'web_search' }],
      max_output_tokens: 4096
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Grok error: ${JSON.stringify(data)}`);
  // Responses API 응답 구조에서 텍스트 추출
  if (data.output) {
    const textParts = data.output
      .filter(o => o.type === 'message')
      .flatMap(o => o.content || [])
      .filter(c => c.type === 'output_text')
      .map(c => c.text);
    return textParts.join('\n');
  }
  return data.choices?.[0]?.message?.content || '';
}

const AI_MODELS = [
  { id: 'chatgpt',    name: 'ChatGPT',    fn: queryOpenAI },
  { id: 'claude',     name: 'Claude',     fn: queryClaude },
  { id: 'gemini',     name: 'Gemini',     fn: queryGemini },
  { id: 'perplexity', name: 'Perplexity', fn: queryPerplexity },
  { id: 'grok',       name: 'Grok',       fn: queryGrok },
];

async function runCheck() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`\n=== GEO Check: ${today} ===\n`);

  const results = {
    date: today,
    timestamp: new Date().toISOString(),
    results: {}
  };

  for (const ai of AI_MODELS) {
    results.results[ai.id] = { name: ai.name, queries: {} };

    for (const query of QUERIES) {
      try {
        console.log(`[${ai.name}] ${query.substring(0, 50)}...`);
        const response = await ai.fn(query);
        const detection = detectMention(response);

        results.results[ai.id].queries[query] = {
          mentioned: detection.mentioned,
          rank: detection.rank,
          attributes: detection.attributes,
          competitors: detection.competitors,
          response: response
        };

        console.log(`  → Mentioned: ${detection.mentioned ? '✅ YES' : '❌ NO'}${detection.rank ? ` (rank #${detection.rank})` : ''}`);
        console.log(`  → Response (first 200 chars): ${response.substring(0, 200).replace(/\n/g, ' ')}`);
        await new Promise(r => setTimeout(r, 1000));

      } catch (err) {
        console.error(`  → ERROR: ${err.message}`);
        results.results[ai.id].queries[query] = {
          mentioned: false,
          rank: null,
          attributes: [],
          competitors: [],
          error: err.message
        };
      }
    }
  }

  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const outPath = path.join(dataDir, `${today}.json`);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ Saved: ${outPath}`);

  fs.writeFileSync(path.join(dataDir, 'latest.json'), JSON.stringify(results, null, 2));

  const indexPath = path.join(dataDir, 'index.json');
  let index = [];
  if (fs.existsSync(indexPath)) {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  }
  if (!index.includes(today)) {
    index.unshift(today);
    index = index.slice(0, 90);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  }

  console.log('\n=== Summary ===');
  for (const ai of AI_MODELS) {
    const queries = results.results[ai.id].queries;
    const mentionCount = Object.values(queries).filter(q => q.mentioned).length;
    console.log(`${ai.name}: ${mentionCount}/${QUERIES.length} queries mentioned Blindex`);
  }
}

runCheck().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

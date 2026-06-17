// GEO Dashboard — Daily AI Mention Tracker
// Runs via GitHub Actions every day at 09:00 KST (00:00 UTC)

const fs = require('fs');
const path = require('path');

const QUERIES = [
  "best single player Indian poker app for Android",
  "Indian poker app without friends",
  "blind man's bluff card game app Android",
  "best offline card game Android free",
  "how to play Indian poker on Android",
  "free single player card game Android no wifi"
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
      max_tokens: 1000
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`OpenAI error: ${JSON.stringify(data)}`);
  return data.choices[0].message.content;
}

// ── Anthropic / Claude (웹 검색 tool 추가) ──────────────────────────────
async function queryClaude(query) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{ role: 'user', content: query }]
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude error: ${JSON.stringify(data)}`);
  // tool_use 포함 응답에서 텍스트 블록만 추출, 없으면 전체 content 합산
  const textBlocks = data.content.filter(b => b.type === 'text').map(b => b.text);
  if (textBlocks.length > 0) return textBlocks.join('\n');
  // 텍스트가 없으면 tool_result까지 포함한 추가 턴 필요 없이 tool_use 이름만 반환
  return data.content.map(b => b.type === 'tool_use' ? `[searching: ${b.input?.query || query}]` : '').join(' ');
}

// ── Google / Gemini (Google Search grounding 활성화) ──────────────────────
async function queryGemini(query) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: query }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 1000 }
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini error: ${JSON.stringify(data)}`);
  // parts가 여러 개일 수 있으므로 전부 합산
  const parts = data.candidates[0].content.parts || [];
  return parts.map(p => p.text || '').join('');
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
      max_tokens: 1000,
      temperature: 0.3
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Perplexity error: ${JSON.stringify(data)}`);
  return data.choices[0].message.content;
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
      max_output_tokens: 1000
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

# Blindex GEO Dashboard

매일 09:00 KST에 6개 쿼리를 5개 AI(ChatGPT, Claude, Gemini, Perplexity, Grok)에 자동으로 질문하고 Blindex 언급 여부를 추적하는 GEO 대시보드입니다.

## 구조

```
/
├── check.js          # API 호출 및 결과 저장 스크립트
├── index.html        # 대시보드 UI
├── package.json
├── data/             # 자동 생성됨
│   ├── index.json    # 날짜 목록
│   ├── latest.json   # 최신 결과
│   └── YYYY-MM-DD.json  # 날짜별 결과
└── .github/
    └── workflows/
        └── daily-check.yml  # GitHub Actions 스케줄
```

## 설정 방법

### 1. GitHub Secrets 등록

저장소 → Settings → Secrets and variables → Actions → New repository secret

| Secret 이름 | 값 |
|---|---|
| `OPENAI_API_KEY` | sk-proj-... |
| `ANTHROPIC_API_KEY` | sk-ant-... |
| `GEMINI_API_KEY` | AIza... |
| `PERPLEXITY_API_KEY` | pplx-... |
| `XAI_API_KEY` | xai-... |

### 2. GitHub Pages 활성화

저장소 → Settings → Pages → Source: Deploy from a branch → Branch: main / root

대시보드 URL: `https://[username].github.io/[repo-name]/`

### 3. 수동 실행 (테스트)

Actions 탭 → Daily GEO Check → Run workflow

## 추적 쿼리

1. best single player Indian poker app for Android
2. Indian poker app without friends
3. blind man's bluff card game app Android
4. best offline card game Android free
5. how to play Indian poker on Android
6. free single player card game Android no wifi

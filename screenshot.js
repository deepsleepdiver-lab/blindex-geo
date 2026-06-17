// screenshot.js — Puppeteer로 GEO 대시보드 자동 캡처
// GitHub Actions에서 check.js 실행 후 바로 실행됨

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function capture() {
  const today = new Date().toISOString().split('T')[0];
  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  console.log(`\n=== Screenshot: ${today} ===`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // 1920×1080 데스크탑 해상도
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  // 로컬 index.html을 file:// 프로토콜로 열기
  const htmlPath = `file://${path.join(__dirname, 'index.html')}`;
  await page.goto(htmlPath, { waitUntil: 'networkidle0', timeout: 30000 });

  // 폰트·데이터 로딩 대기
  await new Promise(r => setTimeout(r, 3000));

  // 전체 페이지 스크린샷
  const fullPath = path.join(screenshotsDir, `${today}.png`);
  await page.screenshot({
    path: fullPath,
    fullPage: true
  });
  console.log(`✅ Full page: ${fullPath}`);

  // 상단 요약 카드 + 매트릭스 부분만 클로즈업 (포트폴리오용)
  const summaryEl = await page.$('.summary-grid');
  if (summaryEl) {
    const summaryPath = path.join(screenshotsDir, `${today}-summary.png`);
    await summaryEl.screenshot({ path: summaryPath });
    console.log(`✅ Summary crop: ${summaryPath}`);
  }

  await browser.close();

  // latest.png 항상 덮어쓰기 (가장 최근 스크린샷)
  fs.copyFileSync(fullPath, path.join(screenshotsDir, 'latest.png'));
  console.log(`✅ latest.png updated`);

  // index 업데이트
  const indexPath = path.join(screenshotsDir, 'index.json');
  let index = [];
  if (fs.existsSync(indexPath)) {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  }
  if (!index.includes(today)) {
    index.unshift(today);
    index = index.slice(0, 90);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  }

  console.log(`\n=== Screenshot complete ===`);
}

capture().catch(err => {
  console.error('Screenshot error:', err);
  process.exit(1);
});

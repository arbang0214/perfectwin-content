#!/usr/bin/env node
/**
 * 월간 성과 리포트 (홈페이지 + 블로그 각각 생성)
 *
 * 사용법:
 *   node monitoring/monthly-report.js
 *   node monitoring/monthly-report.js --month 2026-03
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const fs = require("fs");
const { aggregateAnnual } = require("./annual-aggregator");
const { callClaude } = require("../scripts/lib/claude-api");
const { sendReportToSlack } = require("./utils/slack-sender");
const { generatePDF } = require("./utils/pdf-generator");
const { sendReportEmail } = require("./utils/email-sender");

const REPORTS_DIR = path.join(__dirname, "..", "data", "monitoring", "reports");
const PROMPTS_DIR = path.join(__dirname, "prompts");

function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--month" && args[i + 1]) return args[i + 1];
  }
  return null;
}

function isLastDayOfMonth() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.getDate() === 1;
}

function getMonthRange(yearMonth) {
  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return { from: `${yearMonth}-01`, to: `${yearMonth}-${String(lastDay).padStart(2, "0")}`, year, month, lastDay };
}

function getPrevMonthYM(yearMonth) {
  const [year, month] = yearMonth.split("-").map(Number);
  const pm = month === 1 ? 12 : month - 1;
  const py = month === 1 ? year - 1 : year;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

const MONTH_NAMES = ["", "1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

function loadMonthData(yearMonth) {
  const r = getMonthRange(yearMonth);
  try { return aggregateAnnual(r.from, r.to); } catch { return null; }
}

// ─── 홈페이지 월간 ──────────────────────────────────────

async function generateHomepageMonthly(thisData, prevData, prev2Data, prev3Data, thisMonth, monthName) {
  const systemPrompt = fs.readFileSync(path.join(PROMPTS_DIR, "homepage-system.md"), "utf-8");

  const userPrompt = `아래는 PerfecTwin 홈페이지의 ${thisMonth.year}년 ${monthName} (${thisMonth.from} ~ ${thisMonth.to}) 월간 데이터다.

## 이번 달 GA4 집계
${JSON.stringify(thisData.annual.ga4, null, 2)}

## 이번 달 GSC 집계 (perfectwin.ai)
${JSON.stringify(thisData.annual.gsc?.["perfectwin.ai"] || null, null, 2)}

## 이번 달 요일별 패턴
${JSON.stringify(thisData.annual.dayOfWeek, null, 2)}

## 전월 GA4 집계
${prevData ? JSON.stringify(prevData.annual.ga4, null, 2) : "전월 데이터 없음"}

## 전월 GSC 집계 (perfectwin.ai)
${prevData ? JSON.stringify(prevData.annual.gsc?.["perfectwin.ai"] || null, null, 2) : "전월 데이터 없음"}

## 2개월 전 GA4 집계
${prev2Data ? JSON.stringify(prev2Data.annual.ga4, null, 2) : "데이터 없음"}

## 3개월 전 GA4 집계
${prev3Data ? JSON.stringify(prev3Data.annual.ga4, null, 2) : "데이터 없음"}

이 데이터를 기반으로 홈페이지 월간 인사이트 리포트를 작성해줘.

### 리포트 구조
#### 1. 월간 핵심 요약
핵심 지표 테이블 (전월 대비). 경영진이 30초에 파악할 수 있는 3줄 요약.
#### 2. 트래픽 추이 (전월/3개월 대비)
#### 3. 참여도 분석
#### 4. 유입 채널 분석 (채널별 비중 변화, Organic 성장 여부)
#### 5. Top 페이지 + 전환 퍼널 분석
#### 6. 기기/국가 분포
#### 7. 3개월 트렌드 테이블 (방향 ↑↓→)
#### 8. 인사이트 (6~8개)
비즈니스 임팩트 순. 각각 발견/중요성/원인/→ 액션. 구체적 수치 필수.
#### 9. 다음 달 우선순위 (3~5개, 무엇을/왜/기대효과/첫 액션)

### 형식
- 제목: "📊 홈페이지 월간 인사이트 — ${thisMonth.year}년 ${monthName} (${thisMonth.from} ~ ${thisMonth.to})"
- 한국어, Markdown 테이블, 경영진 보고 수준`;

  return await callClaude(systemPrompt, userPrompt, { maxTokens: 14000 });
}

// ─── 블로그 월간 ────────────────────────────────────────

async function generateBlogMonthly(thisData, prevData, prev2Data, prev3Data, thisMonth, monthName) {
  const systemPrompt = fs.readFileSync(path.join(PROMPTS_DIR, "blog-system.md"), "utf-8");

  const userPrompt = `아래는 PerfecTwin 블로그의 ${thisMonth.year}년 ${monthName} (${thisMonth.from} ~ ${thisMonth.to}) 월간 데이터다.

## 이번 달 inblog 집계
${JSON.stringify(thisData.annual.inblog, null, 2)}

## 이번 달 GSC 집계 (blog.perfectwin.ai)
${JSON.stringify(thisData.annual.gsc?.["blog.perfectwin.ai"] || null, null, 2)}

## 전월 inblog 집계
${prevData ? JSON.stringify(prevData.annual.inblog, null, 2) : "전월 데이터 없음"}

## 전월 GSC 집계 (blog.perfectwin.ai)
${prevData ? JSON.stringify(prevData.annual.gsc?.["blog.perfectwin.ai"] || null, null, 2) : "전월 데이터 없음"}

## 2개월 전 inblog 집계
${prev2Data ? JSON.stringify(prev2Data.annual.inblog, null, 2) : "데이터 없음"}

## 3개월 전 inblog 집계
${prev3Data ? JSON.stringify(prev3Data.annual.inblog, null, 2) : "데이터 없음"}

이 데이터를 기반으로 블로그 월간 인사이트 리포트를 작성해줘.

### 리포트 구조
#### 1. 월간 핵심 요약
영문/한글 블로그 + GSC 핵심 지표 (전월 대비). 3줄 핵심 문장.
#### 2. 블로그 트래픽 (영문/한글 각각, 전월/3개월 대비)
#### 3. 오가닉 유입 + SEO 효과 분석
#### 4. 유입 소스 분석
#### 5. 검색 성과 (노출/클릭/CTR/순위, 핵심 키워드 Top 15, 핵심 페이지 Top 15)
"노출 많고 클릭 0" → 메타 리라이트 대상. "순위 8~15" → 첫 페이지 진입 기회.
#### 6. 3개월 트렌드 테이블 (방향 ↑↓→)
#### 7. 인사이트 (6~8개)
비즈니스 임팩트 순. 각각 발견/중요성/원인/→ 액션. 구체적 수치 필수.
#### 8. 다음 달 콘텐츠 우선순위 (3~5개, 검색 데이터 근거)

### 형식
- 제목: "📝 블로그 월간 인사이트 — ${thisMonth.year}년 ${monthName} (${thisMonth.from} ~ ${thisMonth.to})"
- 한국어, Markdown 테이블, 경영진 보고 수준`;

  return await callClaude(systemPrompt, userPrompt, { maxTokens: 14000 });
}

// ─── 메인 ────────────────────────────────────────────────

async function main() {
  let targetMonth = parseArgs();

  if (!targetMonth) {
    if (!isLastDayOfMonth()) {
      console.log("오늘은 월말이 아닙니다. --month YYYY-MM 으로 수동 실행하세요.");
      return;
    }
    const now = new Date();
    targetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  const thisMonth = getMonthRange(targetMonth);
  const monthName = MONTH_NAMES[thisMonth.month];
  const prevYM = getPrevMonthYM(targetMonth);
  const prev2YM = getPrevMonthYM(prevYM);
  const prev3YM = getPrevMonthYM(prev2YM);

  console.log(`\n📊 월간 리포트 — ${thisMonth.year}년 ${monthName} (${thisMonth.from} ~ ${thisMonth.to})\n`);

  console.log("[1/8] 데이터 집계...");
  const thisData = loadMonthData(targetMonth);
  const prevData = loadMonthData(prevYM);
  const prev2Data = loadMonthData(prev2YM);
  const prev3Data = loadMonthData(prev3YM);

  if (!thisData || thisData.totalDays === 0) {
    console.error("  이번 달 데이터 없음.");
    return;
  }
  console.log(`  이번 달: ${thisData.totalDays}일, 전월: ${prevData?.totalDays || 0}일`);

  ensureDir(REPORTS_DIR);

  // 홈페이지 월간
  console.log("[2/8] 홈페이지 월간 리포트 생성...");
  let homepageReport = null;
  try {
    homepageReport = await generateHomepageMonthly(thisData, prevData, prev2Data, prev3Data, thisMonth, monthName);
    const hp = path.join(REPORTS_DIR, `homepage-monthly-${targetMonth}.md`);
    fs.writeFileSync(hp, homepageReport, "utf-8");
    console.log(`  ✅ ${hp}`);
  } catch (err) { console.error(`  ❌ ${err.message}`); }

  // 블로그 월간
  console.log("[3/8] 블로그 월간 리포트 생성...");
  let blogReport = null;
  try {
    blogReport = await generateBlogMonthly(thisData, prevData, prev2Data, prev3Data, thisMonth, monthName);
    const bp = path.join(REPORTS_DIR, `blog-monthly-${targetMonth}.md`);
    fs.writeFileSync(bp, blogReport, "utf-8");
    console.log(`  ✅ ${bp}`);
  } catch (err) { console.error(`  ❌ ${err.message}`); }

  // Slack 발송
  console.log("[4/8] Slack 발송...");
  if (homepageReport) await sendReportToSlack(homepageReport, "monthly", thisMonth.from);
  if (blogReport) await sendReportToSlack(blogReport, "monthly", thisMonth.from);

  // PDF 생성
  console.log("[5/8] 상세 리포트 PDF 생성...");
  const pdfs = {};
  try {
    if (homepageReport) {
      pdfs.homepage = await generatePDF(homepageReport);
      console.log("  ✅ 홈페이지 PDF 생성 완료");
    }
    if (blogReport) {
      pdfs.blog = await generatePDF(blogReport);
      console.log("  ✅ 블로그 PDF 생성 완료");
    }
  } catch (err) { console.error(`  ❌ PDF 생성 실패: ${err.message}`); }

  // 이메일 발송 (PDF 첨부)
  console.log("[6/8] 상세 리포트 이메일 발송...");
  try {
    if (pdfs.homepage) {
      await sendReportEmail(
        pdfs.homepage,
        `homepage-monthly-${targetMonth}.pdf`,
        `📊 홈페이지 월간 상세 리포트 — ${thisMonth.year}년 ${monthName} (${thisMonth.from} ~ ${thisMonth.to})`,
        `PerfecTwin 홈페이지 월간 상세 리포트 (${thisMonth.year}년 ${monthName}: ${thisMonth.from} ~ ${thisMonth.to})가 첨부되어 있습니다.`
      );
    }
    if (pdfs.blog) {
      await sendReportEmail(
        pdfs.blog,
        `blog-monthly-${targetMonth}.pdf`,
        `📝 블로그 월간 상세 리포트 — ${thisMonth.year}년 ${monthName} (${thisMonth.from} ~ ${thisMonth.to})`,
        `PerfecTwin 블로그 월간 상세 리포트 (${thisMonth.year}년 ${monthName}: ${thisMonth.from} ~ ${thisMonth.to})가 첨부되어 있습니다.`
      );
    }
  } catch (err) { console.error(`  ❌ 이메일 발송 실패: ${err.message}`); }

  console.log("\n✅ 월간 리포트 완료!\n");
}

main().catch((err) => { console.error("치명적 오류:", err); process.exit(1); });

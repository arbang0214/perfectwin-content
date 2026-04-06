#!/usr/bin/env node
/**
 * 주간 성과 리포트 (홈페이지 + 블로그 각각 생성)
 *
 * 사용법:
 *   node monitoring/weekly-report.js
 *   node monitoring/weekly-report.js --date 2026-03-28  (해당 주 금요일 기준)
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
    if (args[i] === "--date" && args[i + 1]) return args[i + 1];
  }
  return null;
}

function getWeekRange(fridayDate) {
  const fri = new Date(fridayDate);
  const mon = new Date(fri);
  mon.setDate(fri.getDate() - 4);
  return { from: mon.toISOString().split("T")[0], to: fri.toISOString().split("T")[0] };
}

function getPrevWeekRange(fridayDate) {
  const fri = new Date(fridayDate);
  fri.setDate(fri.getDate() - 7);
  return getWeekRange(fri.toISOString().split("T")[0]);
}

function getWeekNumber(dateStr) {
  const d = new Date(dateStr);
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
}

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

// ─── 홈페이지 주간 리포트 ────────────────────────────────

async function generateHomepageWeekly(thisWeekData, prevWeekData, weekNum, thisWeek) {
  const systemPrompt = fs.readFileSync(path.join(PROMPTS_DIR, "homepage-system.md"), "utf-8");

  const userPrompt = `아래는 PerfecTwin 홈페이지의 Week ${weekNum} (${thisWeek.from} ~ ${thisWeek.to}) 주간 데이터다.

## 이번 주 GA4 집계
${JSON.stringify(thisWeekData.annual.ga4, null, 2)}

## 이번 주 GSC 집계 (perfectwin.ai)
${JSON.stringify(thisWeekData.annual.gsc?.["perfectwin.ai"] || null, null, 2)}

## 이번 주 요일별 패턴
${JSON.stringify(thisWeekData.annual.dayOfWeek, null, 2)}

## 전주 GA4 집계
${prevWeekData ? JSON.stringify(prevWeekData.annual.ga4, null, 2) : "전주 데이터 없음"}

## 전주 GSC 집계 (perfectwin.ai)
${prevWeekData ? JSON.stringify(prevWeekData.annual.gsc?.["perfectwin.ai"] || null, null, 2) : "전주 데이터 없음"}

이 데이터를 기반으로 홈페이지 주간 인사이트 리포트를 작성해줘.

### 리포트 구조
#### 1. 주간 핵심 요약
핵심 지표 테이블 (전주 대비). 2~3줄 핵심 문장.
#### 2. 트래픽 분석
방문자, 세션, 페이지뷰, 참여율 (전주 대비). 유입 채널 변화.
#### 3. Top 페이지 + 랜딩 페이지
#### 4. 기기/국가
#### 5. 요일별 패턴 (2~3문장)
#### 6. 인사이트 (4~6개)
비즈니스 임팩트 순. 각각 구체적 수치 + → 액션.
#### 7. 다음 주 콘텐츠 추천 (2~3개, 데이터 근거)

### 형식
- 제목: "📊 홈페이지 주간 인사이트 — Week ${weekNum} (${thisWeek.from} ~ ${thisWeek.to})"
- 한국어, Markdown 테이블`;

  return await callClaude(systemPrompt, userPrompt, { maxTokens: 10000 });
}

// ─── 블로그 주간 리포트 ──────────────────────────────────

async function generateBlogWeekly(thisWeekData, prevWeekData, weekNum, thisWeek) {
  const systemPrompt = fs.readFileSync(path.join(PROMPTS_DIR, "blog-system.md"), "utf-8");

  const userPrompt = `아래는 PerfecTwin 블로그의 Week ${weekNum} (${thisWeek.from} ~ ${thisWeek.to}) 주간 데이터다.

## 이번 주 inblog 집계
${JSON.stringify(thisWeekData.annual.inblog, null, 2)}

## 이번 주 GSC 집계 (blog.perfectwin.ai)
${JSON.stringify(thisWeekData.annual.gsc?.["blog.perfectwin.ai"] || null, null, 2)}

## 전주 inblog 집계
${prevWeekData ? JSON.stringify(prevWeekData.annual.inblog, null, 2) : "전주 데이터 없음"}

## 전주 GSC 집계 (blog.perfectwin.ai)
${prevWeekData ? JSON.stringify(prevWeekData.annual.gsc?.["blog.perfectwin.ai"] || null, null, 2) : "전주 데이터 없음"}

이 데이터를 기반으로 블로그 주간 인사이트 리포트를 작성해줘.

### 리포트 구조
#### 1. 주간 핵심 요약
영문/한글 블로그 + GSC 핵심 지표 (전주 대비). 2~3줄 핵심 문장.
#### 2. 블로그 트래픽 (영문/한글 각각)
방문, 클릭, 오가닉, 유입 소스 (전주 대비)
#### 3. Google 검색 성과
노출/클릭/CTR/순위. 주요 키워드 변동. 주요 페이지 변동.
"노출 많고 클릭 0" 페이지 식별 → 메타 리라이트 대상.
#### 4. 인사이트 (4~6개)
비즈니스 임팩트 순. 각각 구체적 수치 + → 액션.
포지션 8~15 키워드 = 첫 페이지 진입 기회 반드시 다룸.
#### 5. 다음 주 콘텐츠 추천 (2~3개, 검색 데이터 근거)

### 형식
- 제목: "📝 블로그 주간 인사이트 — Week ${weekNum} (${thisWeek.from} ~ ${thisWeek.to})"
- 한국어, Markdown 테이블`;

  return await callClaude(systemPrompt, userPrompt, { maxTokens: 10000 });
}

// ─── 메인 ────────────────────────────────────────────────

async function main() {
  const targetFriday = parseArgs() || new Date().toISOString().split("T")[0];
  const thisWeek = getWeekRange(targetFriday);
  const prevWeek = getPrevWeekRange(targetFriday);
  const weekNum = getWeekNumber(targetFriday);

  console.log(`\n📊 주간 리포트 — Week ${weekNum} (${thisWeek.from} ~ ${thisWeek.to})\n`);

  console.log("[1/7] 데이터 집계...");
  let thisWeekData, prevWeekData;
  try { thisWeekData = aggregateAnnual(thisWeek.from, thisWeek.to); } catch { thisWeekData = null; }
  try { prevWeekData = aggregateAnnual(prevWeek.from, prevWeek.to); } catch { prevWeekData = null; }

  if (!thisWeekData || thisWeekData.totalDays === 0) {
    console.error("  이번 주 데이터 없음.");
    return;
  }
  console.log(`  이번 주: ${thisWeekData.totalDays}일, 전주: ${prevWeekData?.totalDays || 0}일`);

  ensureDir(REPORTS_DIR);

  // 홈페이지 주간
  console.log("[2/7] 홈페이지 주간 리포트 생성...");
  let homepageReport = null;
  try {
    homepageReport = await generateHomepageWeekly(thisWeekData, prevWeekData, weekNum, thisWeek);
    const hp = path.join(REPORTS_DIR, `homepage-weekly-${thisWeek.from}.md`);
    fs.writeFileSync(hp, homepageReport, "utf-8");
    console.log(`  ✅ ${hp}`);
  } catch (err) { console.error(`  ❌ ${err.message}`); }

  // 블로그 주간
  console.log("[3/7] 블로그 주간 리포트 생성...");
  let blogReport = null;
  try {
    blogReport = await generateBlogWeekly(thisWeekData, prevWeekData, weekNum, thisWeek);
    const bp = path.join(REPORTS_DIR, `blog-weekly-${thisWeek.from}.md`);
    fs.writeFileSync(bp, blogReport, "utf-8");
    console.log(`  ✅ ${bp}`);
  } catch (err) { console.error(`  ❌ ${err.message}`); }

  // Slack 발송
  console.log("[4/7] Slack 발송...");
  if (homepageReport) await sendReportToSlack(homepageReport, "weekly", thisWeek.from);
  if (blogReport) await sendReportToSlack(blogReport, "weekly", thisWeek.from);

  // PDF 생성
  console.log("[5/7] 상세 리포트 PDF 생성...");
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
  console.log("[6/7] 상세 리포트 이메일 발송...");
  try {
    if (pdfs.homepage) {
      await sendReportEmail(
        pdfs.homepage,
        `homepage-weekly-${thisWeek.from}.pdf`,
        `📊 홈페이지 주간 상세 리포트 — Week ${weekNum} (${thisWeek.from} ~ ${thisWeek.to})`,
        `PerfecTwin 홈페이지 주간 상세 리포트 (Week ${weekNum}: ${thisWeek.from} ~ ${thisWeek.to})가 첨부되어 있습니다.`
      );
    }
    if (pdfs.blog) {
      await sendReportEmail(
        pdfs.blog,
        `blog-weekly-${thisWeek.from}.pdf`,
        `📝 블로그 주간 상세 리포트 — Week ${weekNum} (${thisWeek.from} ~ ${thisWeek.to})`,
        `PerfecTwin 블로그 주간 상세 리포트 (Week ${weekNum}: ${thisWeek.from} ~ ${thisWeek.to})가 첨부되어 있습니다.`
      );
    }
  } catch (err) { console.error(`  ❌ 이메일 발송 실패: ${err.message}`); }

  console.log("\n✅ 주간 리포트 완료!\n");
}

main().catch((err) => { console.error("치명적 오류:", err); process.exit(1); });

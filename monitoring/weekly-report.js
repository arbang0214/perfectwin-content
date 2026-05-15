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
const { runUnifiedWeekly } = require("./unified-weekly-report");
// Legacy: 통합 주간 리포트로 대체. 호출 안 함. 함수는 그대로 유지.
// const { sendReportToSlack } = require("./utils/slack-sender");
// const { generatePDF } = require("./utils/pdf-generator");
// const { sendReportEmail } = require("./utils/email-sender");

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

function getKstToday() {
  // KST(UTC+9) 기준 오늘 날짜를 반환한다.
  // cron이 UTC 23:43에 실행되면 UTC 기준으로는 어제, KST 기준으로는 오늘.
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split("T")[0];
}

// ─── 홈페이지 주간 리포트 ────────────────────────────────

async function generateHomepageWeekly(thisWeekData, prevWeekData, weekNum, thisWeek) {
  const crossRules = fs.readFileSync(path.join(PROMPTS_DIR, "cross-analysis-rules.md"), "utf-8");
  const systemPrompt = fs.readFileSync(path.join(PROMPTS_DIR, "homepage-system.md"), "utf-8") + "\n\n" + crossRules;

  const userPrompt = `아래는 PerfecTwin 홈페이지의 Week ${weekNum} (${thisWeek.from} ~ ${thisWeek.to}) 주간 데이터다.

## 이번 주 GA4 집계
${JSON.stringify(thisWeekData.annual.ga4, null, 2)}

## 이번 주 GSC 집계 (perfectwin.ai)
${JSON.stringify(thisWeekData.annual.gsc?.["perfectwin.ai"] || null, null, 2)}

## 이번 주 요일별 패턴
${JSON.stringify(thisWeekData.annual.dayOfWeek, null, 2)}

## 이번 주 Demo Funnel 집계
${thisWeekData.annual.demoFunnel ? JSON.stringify(thisWeekData.annual.demoFunnel, null, 2) : "데모 퍼널 데이터 없음"}

## 전주 GA4 집계
${prevWeekData ? JSON.stringify(prevWeekData.annual.ga4, null, 2) : "전주 데이터 없음"}

## 전주 GSC 집계 (perfectwin.ai)
${prevWeekData ? JSON.stringify(prevWeekData.annual.gsc?.["perfectwin.ai"] || null, null, 2) : "전주 데이터 없음"}

## 전주 Demo Funnel 집계
${prevWeekData?.annual.demoFunnel ? JSON.stringify(prevWeekData.annual.demoFunnel, null, 2) : "전주 데이터 없음"}

이 데이터를 기반으로 홈페이지 주간 인사이트 리포트를 작성해줘.

### 리포트 구조
#### 1. 주간 핵심 요약
핵심 지표 테이블 (전주 대비). 2~3줄 핵심 문장. **데모 신청 건수(demoFunnel.totals.submissions)는 핵심 지표에 반드시 포함**.
#### 2. 트래픽 분석
방문자, 세션, 페이지뷰, 참여율 (전주 대비). 유입 채널 변화.
#### 3. Top 페이지 + 랜딩 페이지
#### 4. 기기/국가
#### 5. 요일별 패턴 (2~3문장)
#### 5-1. 데모 신청 어트리뷰션 (이번 주 핵심 — ARUM이 가장 보고 싶어하는 지표)
demoFunnel.totals.submissions=0이면 "이번 주 데모 신청 없음"으로 1줄.
≥1이면 아래 모두 작성:
- summary: 데모 페이지 도달 → submit 전환율 (전주 대비).
- **기여 콘텐츠 Top 5 (submit.byLandingPage)**: submit한 사용자가 어느 페이지로 처음 들어왔는지. 블로그 path별로 정리. **이게 다음 주 콘텐츠 의사결정의 핵심 데이터**.
- 채널별 (submit.bySourceMedium): google/organic, linkedin, direct 등 비중.
- first-touch vs last-touch 차이가 크면 별도로 언급.
- intent → submission gap: 의향만 표현한 사용자가 어느 페이지에서 왔는지 (intent.byLandingPage) — CTA·폼 UX 개선 후보.
#### 6. 인사이트 (4~6개)
비즈니스 임팩트 순. 각 인사이트는 아래 구조로 **충분히 자세하게** 서술:
- **현상**: 구체적 수치 + 전주 대비 변화량/변화율.
- **왜 이런 일이 생겼나**: 원인 분석. 어떤 채널/페이지/기기/요일에서 발생했는지 드릴다운. 교차 지표 근거 명시.
- **비즈니스 임팩트**: 전환(데모 요청)이나 브랜드 인지에 어떤 영향인지 설명.
- **→ 액션**: "어떤 페이지의 어떤 요소를 어떻게 수정" 수준의 구체적 지시.
#### 7. 다음 주 콘텐츠 추천 (2~3개, 데이터 근거)

### 형식
- 제목: "📊 홈페이지 주간 인사이트 — Week ${weekNum} (${thisWeek.from} ~ ${thisWeek.to})"
- 한국어, Markdown 테이블`;

  return await callClaude(systemPrompt, userPrompt, { maxTokens: 10000 });
}

// ─── 블로그 주간 리포트 ──────────────────────────────────

async function generateBlogWeekly(thisWeekData, prevWeekData, weekNum, thisWeek) {
  const crossRules = fs.readFileSync(path.join(PROMPTS_DIR, "cross-analysis-rules.md"), "utf-8");
  const systemPrompt = fs.readFileSync(path.join(PROMPTS_DIR, "blog-system.md"), "utf-8") + "\n\n" + crossRules;

  const userPrompt = `아래는 PerfecTwin 블로그의 Week ${weekNum} (${thisWeek.from} ~ ${thisWeek.to}) 주간 데이터다.

## 이번 주 inblog 집계
${JSON.stringify(thisWeekData.annual.inblog, null, 2)}

## 이번 주 GSC 집계 (blog.perfectwin.ai)
${JSON.stringify(thisWeekData.annual.gsc?.["blog.perfectwin.ai"] || null, null, 2)}

## 이번 주 Demo Funnel 집계 (블로그 → 데모 신청 어트리뷰션)
${thisWeekData.annual.demoFunnel ? JSON.stringify(thisWeekData.annual.demoFunnel, null, 2) : "데모 퍼널 데이터 없음"}

## 전주 inblog 집계
${prevWeekData ? JSON.stringify(prevWeekData.annual.inblog, null, 2) : "전주 데이터 없음"}

## 전주 GSC 집계 (blog.perfectwin.ai)
${prevWeekData ? JSON.stringify(prevWeekData.annual.gsc?.["blog.perfectwin.ai"] || null, null, 2) : "전주 데이터 없음"}

## 전주 Demo Funnel 집계
${prevWeekData?.annual.demoFunnel ? JSON.stringify(prevWeekData.annual.demoFunnel, null, 2) : "전주 데이터 없음"}

이 데이터를 기반으로 블로그 주간 인사이트 리포트를 작성해줘.

### 리포트 구조
#### 1. 주간 핵심 요약
영문/한글 블로그 + GSC 핵심 지표 (전주 대비). 2~3줄 핵심 문장. **데모 신청 기여 블로그 수**도 핵심 지표에 포함.
#### 2. 블로그 트래픽 (영문/한글 각각)
방문, 클릭, 오가닉, 유입 소스 (전주 대비)
#### 3. Google 검색 성과
노출/클릭/CTR/순위. 주요 키워드 변동. 주요 페이지 변동.
"노출 많고 클릭 0" 페이지 식별 → 메타 리라이트 대상.
#### 3-1. 데모 신청 기여 블로그 (이번 주 핵심 — 다음 주 콘텐츠 결정에 직접 사용)
demoFunnel.totals.submissions=0이면 "이번 주 데모 신청 없음" 1줄.
≥1이면:
- submit.byLandingPage Top 10에서 **블로그 경로(/blog-en/..., /blog-ko/...)** 만 필터링해서 표로 정리.
- 각 블로그별: submit 세션, 같은 주 inblog 방문수, "방문 → submit 전환"의 강도.
- 비블로그(/, /pricing, /features 등)는 별도 합계만.
- "어떤 주제/각도/CTA가 데모를 잘 만들었는가" 1~2문장 분석 — 다음 주 콘텐츠 선정에 직접 영향.
#### 4. 인사이트 (4~6개)
비즈니스 임팩트 순. 포지션 8~15 키워드 = 첫 페이지 진입 기회 반드시 다룸.
각 인사이트는 아래 구조로 **충분히 자세하게** 서술:
- **현상**: 구체적 수치 + 전주 대비 변화량/변화율.
- **왜 이런 일이 생겼나**: 원인 분석. 어떤 키워드/포스트/소스에서 발생했는지 드릴다운. 교차 지표(inblog ↔ GSC) 근거 명시.
- **비즈니스 임팩트**: SEO 성장이나 리드 확보에 어떤 영향인지 설명.
- **→ 액션**: "어떤 포스트의 어떤 요소를 어떻게 수정" 수준의 구체적 지시.
#### 5. 다음 주 콘텐츠 추천 (2~3개, 검색 데이터 근거)

### 형식
- 제목: "📝 블로그 주간 인사이트 — Week ${weekNum} (${thisWeek.from} ~ ${thisWeek.to})"
- 한국어, Markdown 테이블`;

  return await callClaude(systemPrompt, userPrompt, { maxTokens: 10000 });
}

// ─── 메인 ────────────────────────────────────────────────

async function main() {
  const targetFriday = parseArgs() || getKstToday();
  const thisWeek = getWeekRange(targetFriday);
  const weekNum = getWeekNumber(targetFriday);

  console.log(`\n📊 주간 리포트 (통합) — Week ${weekNum} (${thisWeek.from} ~ ${thisWeek.to})\n`);

  ensureDir(REPORTS_DIR);

  console.log("[1/1] 통합 주간 리포트 생성 + Slack 발송...");
  try {
    await runUnifiedWeekly(targetFriday);
    console.log("\n✅ 주간 리포트 완료!\n");
  } catch (err) {
    console.error(`  ❌ 통합 주간 리포트 실패: ${err.message}\n`);
    process.exit(1);
  }
}

main().catch((err) => { console.error("치명적 오류:", err); process.exit(1); });

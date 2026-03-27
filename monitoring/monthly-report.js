#!/usr/bin/env node
/**
 * 월간 성과 리포트
 * 해당 월 전체 데이터를 집계하여 월간 인사이트를 생성한다.
 * 월말(28~31일)에 cron 실행되며, 실제 월말인지 확인한 후 실행.
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

const REPORTS_DIR = path.join(__dirname, "..", "data", "monitoring", "reports");

function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--month" && args[i + 1]) return args[i + 1];
  }
  return null;
}

function isLastDayOfMonth() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  return tomorrow.getDate() === 1;
}

function getMonthRange(yearMonth) {
  const [year, month] = yearMonth.split("-").map(Number);
  const from = `${yearMonth}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${yearMonth}-${String(lastDay).padStart(2, "0")}`;
  return { from, to, year, month, lastDay };
}

function getPrevMonthRange(yearMonth) {
  const [year, month] = yearMonth.split("-").map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const ym = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
  return getMonthRange(ym);
}

const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, "prompts", "homepage-system.md"), "utf-8")
  + "\n\n" + fs.readFileSync(path.join(__dirname, "prompts", "blog-system.md"), "utf-8")
  + `\n\n추가 역할: 월간 종합 리포트 작성자. 경영진 보고 수준의 깊이 있는 분석을 제공한다.`;

async function main() {
  let targetMonth = parseArgs();

  // 자동 실행 시 월말 체크
  if (!targetMonth) {
    if (!isLastDayOfMonth()) {
      console.log("오늘은 월말이 아닙니다. --month YYYY-MM 으로 수동 실행하세요.");
      return;
    }
    const now = new Date();
    targetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  const thisMonth = getMonthRange(targetMonth);
  const prevMonth = getPrevMonthRange(targetMonth);
  const monthNames = ["", "1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
  const monthName = monthNames[thisMonth.month];

  console.log(`\n📊 월간 리포트 — ${thisMonth.year}년 ${monthName} (${thisMonth.from} ~ ${thisMonth.to})\n`);

  // 데이터 집계
  console.log("[1/3] 데이터 집계...");
  let thisMonthData, prevMonthData;
  try {
    thisMonthData = aggregateAnnual(thisMonth.from, thisMonth.to);
  } catch { thisMonthData = null; }
  try {
    prevMonthData = aggregateAnnual(prevMonth.from, prevMonth.to);
  } catch { prevMonthData = null; }

  if (!thisMonthData || thisMonthData.totalDays === 0) {
    console.error("  이번 달 데이터 없음. 먼저 일간 수집을 실행하세요.");
    return;
  }

  // 최근 3개월 트렌드용
  let month2ago = null, month3ago = null;
  try {
    const m2 = getPrevMonthRange(prevMonth.from.slice(0, 7));
    month2ago = aggregateAnnual(m2.from, m2.to);
  } catch {}
  try {
    const m2 = getPrevMonthRange(prevMonth.from.slice(0, 7));
    const m3 = getPrevMonthRange(m2.from.slice(0, 7));
    month3ago = aggregateAnnual(m3.from, m3.to);
  } catch {}

  console.log(`  이번 달: ${thisMonthData.totalDays}일, 전월: ${prevMonthData?.totalDays || 0}일`);

  // Claude API 호출
  console.log("[2/3] Claude API로 월간 리포트 생성...");
  const userPrompt = `아래는 PerfecTwin의 ${thisMonth.year}년 ${monthName} (${thisMonth.from} ~ ${thisMonth.to}) 월간 데이터다.

## 이번 달 집계
${JSON.stringify(thisMonthData.annual, null, 2)}

## 전월 집계 (${prevMonth.from} ~ ${prevMonth.to})
${prevMonthData ? JSON.stringify(prevMonthData.annual, null, 2) : "전월 데이터 없음"}

## 2개월 전 집계
${month2ago ? JSON.stringify(month2ago.annual, null, 2) : "데이터 없음"}

## 3개월 전 집계
${month3ago ? JSON.stringify(month3ago.annual, null, 2) : "데이터 없음"}

이 데이터를 기반으로 월간 종합 인사이트 리포트를 작성해줘.

### 리포트 구조
반드시 아래 순서를 따른다:

#### 1. 월간 핵심 요약
한눈에 보는 이번 달 성과. 핵심 지표 테이블 (전월 대비 변화율 포함).
3줄 이내 핵심 문장. 경영진이 30초에 파악할 수 있는 수준.

#### 2. 홈페이지 월간 성과 (GA4)
- 트래픽 추이: 방문자, 세션, 페이지뷰 (전월/전전월 대비)
- 참여도: 참여율, 체류시간, 세션당 페이지뷰 변화
- 유입 채널 분석: 채널별 비중, 전월 대비 변화. 특히 Organic 성장 여부
- Top 페이지: 상위 10개. 전환 퍼널(인지→관심→전환) 관점 분석
- 기기/국가: 분포 변화, 타겟 시장 분석

#### 3. 블로그 월간 성과 (inblog)
- 영문/한글 트래픽 (전월 대비)
- 오가닉 유입 성장률 (SEO 핵심 지표)
- 유입 소스: 어떤 채널이 블로그 트래픽을 만드는지
- 포스트 vs 비포스트 페이지 비중

#### 4. 검색 성과 월간 분석 (GSC)
- perfectwin.ai: 노출, 클릭, CTR, 순위 (전월 대비)
- blog.perfectwin.ai: 동일
- 핵심 키워드 Top 15: 노출/클릭/순위, 카테고리 분류
- 핵심 페이지 Top 15: 노출/클릭, "노출 많고 클릭 0" 식별

#### 5. 3개월 트렌드
핵심 지표의 3개월 변화 테이블. 방향(↑↓→) 표시.

#### 6. 종합 인사이트 (6~10개)
이 섹션이 핵심. 단순 수치 나열이 아닌, 전략적 시사점.
비즈니스 임팩트 순 정렬. 각각:
- 무엇이 발견되었는지 (구체적 수치)
- 왜 중요한지 (비즈니스 맥락)
- 원인 분석/가설
- → 액션: 아주 구체적인 행동 제안

#### 7. 다음 달 우선순위
번호 매겨 3~5개. 각각 (1) 무엇을 (2) 왜 (3) 기대 효과 (4) 첫 번째 액션.
데이터 근거 필수.

### 형식
- 제목: "📊 월간 종합 인사이트 — ${thisMonth.year}년 ${monthName} (${thisMonth.from} ~ ${thisMonth.to})"
- 한국어, Markdown 테이블, 인사이트 번호 매기기
- 경영진 보고 수준의 완성도. 충분히 상세하게.`;

  const report = await callClaude(SYSTEM_PROMPT, userPrompt, { maxTokens: 16000 });

  // 저장 + Slack 발송
  console.log("[3/3] 저장 및 Slack 발송...");
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const mdPath = path.join(REPORTS_DIR, `monthly-${targetMonth}.md`);
  fs.writeFileSync(mdPath, report, "utf-8");
  console.log(`  ✅ MD: ${mdPath}`);

  await sendReportToSlack(report, "monthly", thisMonth.from);

  console.log("\n✅ 월간 리포트 완료!\n");
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});

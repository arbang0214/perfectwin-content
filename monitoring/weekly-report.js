#!/usr/bin/env node
/**
 * 주간 성과 리포트
 * 이번 주(월~금) 일간 데이터를 집계하여 주간 인사이트를 생성한다.
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

const REPORTS_DIR = path.join(__dirname, "..", "data", "monitoring", "reports");

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
  mon.setDate(fri.getDate() - 4); // 월요일
  return {
    from: mon.toISOString().split("T")[0],
    to: fri.toISOString().split("T")[0],
  };
}

function getPrevWeekRange(fridayDate) {
  const fri = new Date(fridayDate);
  fri.setDate(fri.getDate() - 7);
  return getWeekRange(fri.toISOString().split("T")[0]);
}

function getWeekNumber(dateStr) {
  const d = new Date(dateStr);
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d - start;
  return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
}

const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, "prompts", "homepage-system.md"), "utf-8")
  + "\n\n" + fs.readFileSync(path.join(__dirname, "prompts", "blog-system.md"), "utf-8")
  + `\n\n추가 역할: 주간 종합 리포트 작성자. 홈페이지 + 블로그를 하나의 리포트로 통합 분석한다.`;

async function main() {
  const targetFriday = parseArgs() || new Date().toISOString().split("T")[0];
  const thisWeek = getWeekRange(targetFriday);
  const prevWeek = getPrevWeekRange(targetFriday);
  const weekNum = getWeekNumber(targetFriday);

  console.log(`\n📊 주간 리포트 — Week ${weekNum} (${thisWeek.from} ~ ${thisWeek.to})\n`);

  // 이번 주 + 전주 데이터 집계
  console.log("[1/3] 데이터 집계...");
  let thisWeekData, prevWeekData;
  try {
    thisWeekData = aggregateAnnual(thisWeek.from, thisWeek.to);
  } catch { thisWeekData = null; }
  try {
    prevWeekData = aggregateAnnual(prevWeek.from, prevWeek.to);
  } catch { prevWeekData = null; }

  if (!thisWeekData || thisWeekData.totalDays === 0) {
    console.error("  이번 주 데이터 없음. 먼저 일간 수집을 실행하세요.");
    return;
  }

  console.log(`  이번 주: ${thisWeekData.totalDays}일, 전주: ${prevWeekData?.totalDays || 0}일`);

  // Claude API 호출
  console.log("[2/3] Claude API로 주간 리포트 생성...");
  const userPrompt = `아래는 PerfecTwin의 Week ${weekNum} (${thisWeek.from} ~ ${thisWeek.to}) 주간 데이터다.

## 이번 주 집계
${JSON.stringify(thisWeekData.annual, null, 2)}

## 이번 주 월별(일별) 상세
${JSON.stringify(thisWeekData.monthly, null, 2)}

## 전주 집계 (${prevWeek.from} ~ ${prevWeek.to})
${prevWeekData ? JSON.stringify(prevWeekData.annual, null, 2) : "전주 데이터 없음"}

이 데이터를 기반으로 주간 종합 인사이트 리포트를 작성해줘.

### 리포트 구조
반드시 아래 순서를 따른다:

#### 1. 주간 핵심 요약
홈페이지(GA4) + 블로그(inblog) + 검색(GSC) 핵심 지표를 하나의 요약 테이블로.
전주 대비 변화율 포함. 2~3줄 핵심 문장.

#### 2. 홈페이지 주간 성과
- 트래픽: 방문자, 세션, 페이지뷰, 참여율 (전주 대비)
- 유입 채널 변화
- Top 페이지
- 특이사항

#### 3. 블로그 주간 성과
- 영문/한글 블로그 트래픽 (전주 대비)
- 오가닉 유입 변화
- 유입 소스

#### 4. 검색 성과 주간 변화
- GSC perfectwin.ai + blog.perfectwin.ai 각각
- 노출/클릭/순위 변화
- 주요 키워드 변동
- 주요 페이지 변동

#### 5. 인사이트 (5~8개)
비즈니스 임팩트 순 정렬. 각각:
- 무엇이 변했는지 (구체적 수치)
- 왜 중요한지
- → 액션: 구체적 행동 제안

#### 6. 다음 주 콘텐츠 추천
검색 데이터 기반으로 2~3개 콘텐츠 주제 추천. 각각 근거 명시.

### 형식
- 제목: "📊 주간 종합 인사이트 — Week ${weekNum} (${thisWeek.from} ~ ${thisWeek.to})"
- 한국어, Markdown 테이블, 인사이트 번호 매기기`;

  const report = await callClaude(SYSTEM_PROMPT, userPrompt, { maxTokens: 12000 });

  // 저장 + Slack 발송
  console.log("[3/3] 저장 및 Slack 발송...");
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const mdPath = path.join(REPORTS_DIR, `weekly-${thisWeek.from}.md`);
  fs.writeFileSync(mdPath, report, "utf-8");
  console.log(`  ✅ MD: ${mdPath}`);

  await sendReportToSlack(report, "weekly", thisWeek.from);

  console.log("\n✅ 주간 리포트 완료!\n");
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});

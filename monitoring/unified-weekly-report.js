/**
 * 통합 주간 리포트 생성기
 *
 * 모든 데이터 소스(GA4, GSC, inblog, demoFunnel) 5일치 집계를 한 번에
 * Claude에 넘겨 단일 마크다운 리포트를 생성하고 Slack 단일 메시지로 발송한다.
 *
 * 기존 generateHomepageWeekly / generateBlogWeekly 를 대체.
 */

const fs = require("fs");
const path = require("path");
const { aggregateAnnual } = require("./annual-aggregator");
const { callClaude } = require("../scripts/lib/claude-api");
const { sendUnifiedDailyToSlack } = require("./utils/slack-sender");
const { enrichInplace } = require("./utils/blog-title-enricher");

const PROMPTS_DIR = path.join(__dirname, "prompts");
const REPORTS_DIR = path.join(__dirname, "..", "data", "monitoring", "reports");
const DATA_DIR = path.join(__dirname, "..", "data", "monitoring");

/**
 * 지정 기간 내에서 가장 최근의 영문+한글 slug→title 통합 매핑을 찾는다.
 * 영문/한글 별도로 가장 최근 것을 찾아 합친다. (충돌 시 영문 우선)
 */
function loadLatestSlugToTitle(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  const findByLabel = (label) => {
    for (let d = new Date(end); d >= start; d.setDate(d.getDate() - 1)) {
      const dateStr = d.toISOString().split("T")[0];
      const file = path.join(DATA_DIR, `${dateStr}.json`);
      if (!fs.existsSync(file)) continue;
      try {
        const snap = JSON.parse(fs.readFileSync(file, "utf-8"));
        const map = snap.inblog?.blogs?.find((b) => b.label === label)?.slugToTitle;
        if (map && Object.keys(map).length > 0) return map;
      } catch { /* 다음 날짜 시도 */ }
    }
    return {};
  };
  return { ...findByLabel("blog-ko"), ...findByLabel("blog-en") };
}

function loadPromptFile(filename) {
  return fs.readFileSync(path.join(PROMPTS_DIR, filename), "utf-8");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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

/**
 * 통합 주간 리포트 생성 (Claude 호출 + 파일 저장 + 반환)
 */
async function generateUnifiedWeekly(targetFriday) {
  const thisWeek = getWeekRange(targetFriday);
  const prevWeek = getPrevWeekRange(targetFriday);
  const weekNum = getWeekNumber(targetFriday);

  let thisWeekData = null;
  let prevWeekData = null;
  try { thisWeekData = aggregateAnnual(thisWeek.from, thisWeek.to); } catch { /* 무시 */ }
  try { prevWeekData = aggregateAnnual(prevWeek.from, prevWeek.to); } catch { /* 무시 */ }

  if (!thisWeekData || thisWeekData.totalDays === 0) {
    console.log(`  [통합 주간] 이번 주 데이터 없음 — 건너뜀`);
    return null;
  }

  // 영문+한글 통합 slug→title 매핑으로 GSC blog topPages·demoFunnel byLandingPage를 enrich
  const slugToTitle = loadLatestSlugToTitle(thisWeek.from, thisWeek.to);
  const thisWeekGscBlog = thisWeekData.annual.gsc?.["blog.perfectwin.ai"] || null;
  const thisWeekGscKoBlog = thisWeekData.annual.gsc?.["ko.blog.perfectwin.ai"] || null;
  enrichInplace({
    gscBlogSites: [thisWeekGscBlog, thisWeekGscKoBlog].filter(Boolean),
    demoFunnel: thisWeekData.annual.demoFunnel,
    slugToTitle,
  });

  const crossRules = loadPromptFile("cross-analysis-rules.md");
  const systemPrompt = loadPromptFile("unified-weekly-system.md") + "\n\n" + crossRules;

  const userPrompt = `Week ${weekNum} (${thisWeek.from} ~ ${thisWeek.to}) 주간 데이터다. 통합 주간 리포트 마크다운을 작성하라.

## 이번 주 GA4 집계 (5일 누적)
${JSON.stringify(thisWeekData.annual.ga4, null, 2)}

## 이번 주 GSC — perfectwin.ai (5일 누적)
${JSON.stringify(thisWeekData.annual.gsc?.["perfectwin.ai"] || null, null, 2)}

## 이번 주 GSC — blog.perfectwin.ai (5일 누적)
${JSON.stringify(thisWeekData.annual.gsc?.["blog.perfectwin.ai"] || null, null, 2)}

## 이번 주 inblog 집계 (블로그)
${JSON.stringify(thisWeekData.annual.inblog, null, 2)}

## 이번 주 Demo Funnel 집계 (핵심 어트리뷰션)
${thisWeekData.annual.demoFunnel ? JSON.stringify(thisWeekData.annual.demoFunnel, null, 2) : "데모 퍼널 데이터 없음"}

## 이번 주 Content Funnel 집계 (UTM 박힌 캠페인별 행동·전환)
${thisWeekData.annual.contentFunnel ? JSON.stringify(thisWeekData.annual.contentFunnel, null, 2) : "Content 퍼널 데이터 없음"}

## 이번 주 요일별 패턴
${JSON.stringify(thisWeekData.annual.dayOfWeek, null, 2)}

## 전주 GA4 집계 (비교용)
${prevWeekData ? JSON.stringify(prevWeekData.annual.ga4, null, 2) : "전주 데이터 없음"}

## 전주 GSC — perfectwin.ai (비교용)
${prevWeekData ? JSON.stringify(prevWeekData.annual.gsc?.["perfectwin.ai"] || null, null, 2) : "전주 데이터 없음"}

## 전주 GSC — blog.perfectwin.ai (비교용)
${prevWeekData ? JSON.stringify(prevWeekData.annual.gsc?.["blog.perfectwin.ai"] || null, null, 2) : "전주 데이터 없음"}

## 전주 inblog 집계 (비교용)
${prevWeekData ? JSON.stringify(prevWeekData.annual.inblog, null, 2) : "전주 데이터 없음"}

## 전주 Demo Funnel 집계 (비교용)
${prevWeekData?.annual.demoFunnel ? JSON.stringify(prevWeekData.annual.demoFunnel, null, 2) : "전주 데이터 없음"}

## 전주 Content Funnel 집계 (비교용)
${prevWeekData?.annual.contentFunnel ? JSON.stringify(prevWeekData.annual.contentFunnel, null, 2) : "전주 데이터 없음"}

위 데이터로 시스템 프롬프트에 정의된 통합 주간 리포트 마크다운을 작성하라. Week 번호는 ${weekNum}.`;

  console.log("  [통합 주간] Claude 호출...");
  const report = await callClaude(systemPrompt, userPrompt, { maxTokens: 14000 });

  ensureDir(REPORTS_DIR);
  const filePath = path.join(REPORTS_DIR, `unified-weekly-${thisWeek.from}.md`);
  fs.writeFileSync(filePath, report, "utf-8");
  console.log(`  [통합 주간] 저장: ${filePath}`);

  return { report, weekNum, thisWeek };
}

/**
 * 통합 주간 리포트를 생성하고 Slack으로 발송한다.
 */
async function runUnifiedWeekly(targetFriday) {
  const result = await generateUnifiedWeekly(targetFriday);
  if (!result) return null;

  const { report, weekNum, thisWeek } = result;
  const title = `📊 PerfecTwin 주간 리포트 — Week ${weekNum} (${thisWeek.from} ~ ${thisWeek.to})`;

  console.log("  [통합 주간] Slack 발송...");
  await sendUnifiedDailyToSlack({ title, body: report });

  return report;
}

module.exports = { generateUnifiedWeekly, runUnifiedWeekly };

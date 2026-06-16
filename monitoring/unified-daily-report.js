/**
 * 통합 일간 리포트 생성기
 *
 * 모든 데이터 소스(GA4, GSC, inblog, demoFunnel)를 한 번에 Claude에 넘겨
 * 단일 마크다운 리포트를 생성한다.
 * → Slack 헤드라인 + thread reply로 발송.
 *
 * 기존 generateHomepageDaily / generateBlogDaily / generateLinkedInReport 를 대체.
 */

const fs = require("fs");
const path = require("path");
const { callClaude } = require("../scripts/lib/claude-api");
const { sendUnifiedDailyToSlack } = require("./utils/slack-sender");
const { enrichInplace } = require("./utils/blog-title-enricher");

const PROMPTS_DIR = path.join(__dirname, "prompts");
const REPORTS_DIR = path.join(__dirname, "..", "data", "monitoring", "reports");
const DATA_DIR = path.join(__dirname, "..", "data", "monitoring");

function loadPromptFile(filename) {
  return fs.readFileSync(path.join(PROMPTS_DIR, filename), "utf-8");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadSnapshot(date) {
  const file = path.join(DATA_DIR, `${date}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function getPreviousDate(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function getWeekDates(endDate) {
  const dates = [];
  const d = new Date(endDate);
  for (let i = 6; i >= 0; i--) {
    const dd = new Date(d);
    dd.setDate(dd.getDate() - i);
    dates.push(dd.toISOString().split("T")[0]);
  }
  return dates;
}

function getDayOfWeek(dateStr) {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return days[new Date(dateStr).getDay()];
}

/**
 * 헤드라인 섹션(## ⚡ 헤드라인)만 추출.
 */
function extractHeadline(reportMd) {
  const lines = reportMd.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s*⚡?\s*헤드라인/.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return reportMd.split("\n").slice(0, 8).join("\n");

  const headlineLines = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^---/.test(lines[i].trim())) break;
    if (/^##\s/.test(lines[i])) break;
    headlineLines.push(lines[i]);
  }
  return headlineLines.join("\n").trim();
}

/**
 * 통합 일간 리포트 생성 (Claude 호출 + 파일 저장 + 반환)
 */
async function generateUnifiedDaily(targetDate) {
  const todayData = loadSnapshot(targetDate);
  if (!todayData) {
    console.log(`  [통합 리포트] ${targetDate} 스냅샷 없음 — 건너뜀`);
    return null;
  }

  const yesterdayDate = getPreviousDate(targetDate);
  const yesterdayData = loadSnapshot(yesterdayDate);

  // 최근 7일 추세 — 핵심 지표만 추출해서 컨텍스트 비중 줄임
  const weekDates = getWeekDates(targetDate);
  const weekSummary = weekDates
    .map((d) => loadSnapshot(d))
    .filter(Boolean)
    .map((s) => ({
      date: s.date,
      ga4: s.ga4?.summary || null,
      demoFunnel: s.demoFunnel?.summary || null,
      gscSite: s.gsc?.sites?.find((x) => x.label === "perfectwin.ai")?.totals || null,
      gscBlog: s.gsc?.sites?.find((x) => x.label === "blog.perfectwin.ai")?.totals || null,
    }));

  // 사이트별 데이터 추출
  const todayGscSite = todayData.gsc?.sites?.find((s) => s.label === "perfectwin.ai") || null;
  const todayGscBlog = todayData.gsc?.sites?.find((s) => s.label === "blog.perfectwin.ai") || null;
  const yesterdayGscSite = yesterdayData?.gsc?.sites?.find((s) => s.label === "perfectwin.ai") || null;
  const yesterdayGscBlog = yesterdayData?.gsc?.sites?.find((s) => s.label === "blog.perfectwin.ai") || null;

  // 영문+한글 블로그 slug→title 매핑을 합쳐서 GSC/demoFunnel 슬러그를 제목으로 enrich
  // (영문/한글이 같은 슬러그를 쓸 가능성은 거의 없지만 충돌 시 영문이 우선되도록 영문을 뒤에 spread)
  const todayGscKoBlog = todayData.gsc?.sites?.find((s) => s.label === "ko.blog.perfectwin.ai") || null;
  const slugToTitle = {
    ...(todayData.inblog?.blogs?.find((b) => b.label === "blog-ko")?.slugToTitle || {}),
    ...(todayData.inblog?.blogs?.find((b) => b.label === "blog-en")?.slugToTitle || {}),
  };
  enrichInplace({
    gscBlogSites: [todayGscBlog, todayGscKoBlog].filter(Boolean),
    demoFunnel: todayData.demoFunnel,
    slugToTitle,
  });

  const crossRules = loadPromptFile("cross-analysis-rules.md");
  const systemPrompt = loadPromptFile("unified-daily-system.md") + "\n\n" + crossRules;

  const dayOfWeek = getDayOfWeek(targetDate);
  const userPrompt = `오늘은 ${targetDate} (${dayOfWeek}요일). 아래 데이터를 기반으로 v2 통합 일간 리포트를 작성하라.

## 오늘 GA4 (홈페이지)
${JSON.stringify(todayData.ga4, null, 2)}

## 오늘 GSC — perfectwin.ai
${JSON.stringify(todayGscSite, null, 2)}

## 오늘 GSC — blog.perfectwin.ai
${JSON.stringify(todayGscBlog, null, 2)}

## 오늘 inblog (블로그)
${JSON.stringify(todayData.inblog, null, 2)}

## 오늘 Demo Funnel (데모 신청 어트리뷰션 — 핵심 데이터)
${todayData.demoFunnel ? JSON.stringify(todayData.demoFunnel, null, 2) : "데모 퍼널 데이터 없음"}

## 오늘 Content Funnel (UTM 박힌 트래픽의 캠페인별 행동·전환 — 시나리오 3 답)
${todayData.contentFunnel ? JSON.stringify(todayData.contentFunnel, null, 2) : "Content 퍼널 데이터 없음"}

## 어제 GA4 요약 (전일 비교용)
${yesterdayData?.ga4?.summary ? JSON.stringify(yesterdayData.ga4.summary, null, 2) : "어제 데이터 없음"}

## 어제 GSC — perfectwin.ai (전일 비교용)
${yesterdayGscSite ? JSON.stringify(yesterdayGscSite?.totals, null, 2) : "어제 데이터 없음"}

## 어제 GSC — blog.perfectwin.ai (전일 비교용)
${yesterdayGscBlog ? JSON.stringify(yesterdayGscBlog?.totals, null, 2) : "어제 데이터 없음"}

## 어제 Demo Funnel 요약 (전일 비교용)
${yesterdayData?.demoFunnel?.summary ? JSON.stringify(yesterdayData.demoFunnel.summary, null, 2) : "어제 데이터 없음"}

## 어제 Content Funnel 요약 (전일 비교용)
${yesterdayData?.contentFunnel?.summary ? JSON.stringify(yesterdayData.contentFunnel.summary, null, 2) : "어제 데이터 없음"}

## 최근 7일 추세 (맥락 활용)
${weekSummary.length > 0 ? JSON.stringify(weekSummary, null, 2) : "7일 데이터 없음 (초기 수집 단계)"}

위 데이터로 시스템 프롬프트에 정의된 v2 통합 일간 리포트 마크다운을 작성하라.`;

  console.log("  [통합 리포트] Claude 호출...");
  const report = await callClaude(systemPrompt, userPrompt, { maxTokens: 12000 });

  ensureDir(REPORTS_DIR);
  const filePath = path.join(REPORTS_DIR, `unified-daily-${targetDate}.md`);
  fs.writeFileSync(filePath, report, "utf-8");
  console.log(`  [통합 리포트] 저장: ${filePath}`);

  return report;
}

/**
 * 통합 일간 리포트를 생성하고 Slack으로 발송한다.
 * 단일 메시지로 발송 (헤드라인+본문 통합).
 */
async function runUnifiedDaily(targetDate) {
  const report = await generateUnifiedDaily(targetDate);
  if (!report) return null;

  const dayOfWeek = getDayOfWeek(targetDate);
  const title = `📊 PerfecTwin 일간 리포트 — ${targetDate} (${dayOfWeek})`;

  console.log("  [통합 리포트] Slack 발송...");
  await sendUnifiedDailyToSlack({ title, body: report });

  // Slack 발송 성공 sidecar — 다음 cron의 --skip-if-exists는 이 파일을 기준으로 판단.
  // .md만 있고 sidecar 없으면 백업 cron이 재시도해서 슬랙 무음 실패를 자동 복구한다.
  const sidecarPath = path.join(REPORTS_DIR, `unified-daily-${targetDate}.slack.ok`);
  fs.writeFileSync(sidecarPath, new Date().toISOString(), "utf-8");

  return report;
}

module.exports = { generateUnifiedDaily, runUnifiedDaily, extractHeadline };

/**
 * 인사이트 리포트 생성기
 * 수집된 데이터를 Claude API에 전달하여 홈페이지/블로그 일간 인사이트 리포트를 생성한다.
 */

const fs = require("fs");
const path = require("path");
const { callClaude } = require("../scripts/lib/claude-api");

const PROMPTS_DIR = path.join(__dirname, "prompts");
const REPORTS_DIR = path.join(__dirname, "..", "data", "monitoring", "reports");
const DATA_DIR = path.join(__dirname, "..", "data", "monitoring");

// ─── 유틸리티 ────────────────────────────────────────────

function loadPromptFile(filename) {
  return fs.readFileSync(path.join(PROMPTS_DIR, filename), "utf-8");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadSnapshot(date) {
  const file = path.join(DATA_DIR, `${date}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return null; }
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

// ─── 홈페이지 일간 리포트 ────────────────────────────────

async function generateHomepageDaily(targetDate) {
  const systemPrompt = loadPromptFile("homepage-system.md");
  const todayData = loadSnapshot(targetDate);
  if (!todayData || !todayData.ga4) {
    console.log("  [리포트] 홈페이지: GA4 데이터 없음, 건너뜀");
    return null;
  }

  const yesterdayDate = getPreviousDate(targetDate);
  const yesterdayData = loadSnapshot(yesterdayDate);

  // 최근 7일 요약
  const weekDates = getWeekDates(targetDate);
  const weekSummary = weekDates
    .map((d) => loadSnapshot(d))
    .filter(Boolean)
    .map((s) => ({ date: s.date, ...s.ga4?.summary }));

  // GSC에서 perfectwin.ai 데이터만 추출
  const todayGscSite = todayData.gsc?.sites?.find((s) => s.label === "perfectwin.ai") || null;
  const yesterdayGscSite = yesterdayData?.gsc?.sites?.find((s) => s.label === "perfectwin.ai") || null;

  const dayOfWeek = getDayOfWeek(targetDate);
  const userPrompt = `아래는 PerfecTwin 홈페이지의 ${targetDate} (${dayOfWeek}요일) 성과 데이터다.

## 오늘 GA4 데이터
${JSON.stringify(todayData.ga4, null, 2)}

## 오늘 GSC 데이터 (perfectwin.ai)
${JSON.stringify(todayGscSite, null, 2)}

## 어제 GA4 데이터 (전일 비교용)
${yesterdayData?.ga4 ? JSON.stringify(yesterdayData.ga4.summary, null, 2) : "어제 데이터 없음"}

## 어제 GSC 데이터 (전일 비교용)
${yesterdayGscSite ? JSON.stringify(yesterdayGscSite, null, 2) : "어제 데이터 없음"}

## 최근 7일 요약 (추이 맥락용)
${weekSummary.length > 0 ? JSON.stringify(weekSummary, null, 2) : "7일 데이터 없음 (초기 수집 단계)"}

이 데이터를 기반으로 홈페이지 일간 성과 인사이트 리포트를 작성해줘.

### 리포트 구조

반드시 아래 순서와 형식을 따른다:

#### 1. 핵심 숫자 테이블
포함 지표: 방문자(activeUsers, 신규/재방문 구분), 세션, 페이지뷰, 참여율, 세션당 페이지뷰, 평균 체류 시간(N분 N초 변환). 각 지표의 "의미" 컬럼 포함. 전일 대비 변화량 (+n) 또는 (-n).

#### 2. 유입 경로 테이블
채널별 세션, 비중(%), 참여율. "이 채널은?" 컬럼에 채널 설명. 세션 2건 이상인 소스 상세 테이블 추가.

#### 3. 페이지 성과 Top 5
조회수, 사용자수, 체류시간, 이탈률. "해석" 컬럼.

#### 4. 랜딩 페이지 (첫 진입점)
세션 2건 이상만. 이탈률, 체류, 페이지/세션, 해석.

#### 5. 기기 / 국가
기기별, 상위 3개국 요약.

#### 6. 인사이트
3~6개. 비즈니스 임팩트 순 정렬. 각 인사이트에 (1) 변화/현상, (2) 왜 중요, (3) 맥락. 끝에 "→ 액션:" 포함.

### 형식
- 제목: "📊 홈페이지 일간 인사이트 — ${targetDate} (${dayOfWeek})"
- 언어: 한국어
- 체류 시간: "N분 N초" 변환
- 테이블: Markdown 테이블`;

  console.log("  [리포트] 홈페이지 일간 생성 중...");
  const report = await callClaude(systemPrompt, userPrompt, { maxTokens: 8192 });

  ensureDir(REPORTS_DIR);
  const filePath = path.join(REPORTS_DIR, `homepage-daily-${targetDate}.md`);
  fs.writeFileSync(filePath, report, "utf-8");
  console.log(`  [리포트] 저장: ${filePath}`);
  return report;
}

// ─── 블로그 일간 리포트 ──────────────────────────────────

async function generateBlogDaily(targetDate) {
  const systemPrompt = loadPromptFile("blog-system.md");
  const todayData = loadSnapshot(targetDate);

  const hasInblog = todayData?.inblog?.blogs?.some((b) => b.traffic);
  const hasGsc = todayData?.gsc?.sites?.some((s) => s.label === "blog.perfectwin.ai" && s.totals);
  if (!hasInblog && !hasGsc) {
    console.log("  [리포트] 블로그: inblog/GSC 데이터 없음, 건너뜀");
    return null;
  }

  const yesterdayDate = getPreviousDate(targetDate);
  const yesterdayData = loadSnapshot(yesterdayDate);

  // 최근 7일 요약
  const weekDates = getWeekDates(targetDate);
  const weekSummary = weekDates.map((d) => {
    const s = loadSnapshot(d);
    if (!s) return null;
    const enTraffic = s.inblog?.blogs?.find((b) => b.label === "blog-en")?.traffic?.data?.[0];
    const koTraffic = s.inblog?.blogs?.find((b) => b.label === "blog-ko")?.traffic?.data?.[0];
    const gscBlog = s.gsc?.sites?.find((si) => si.label === "blog.perfectwin.ai");
    return {
      date: d,
      en: enTraffic || null,
      ko: koTraffic || null,
      gsc: gscBlog?.totals || null,
    };
  }).filter(Boolean);

  // GSC blog 데이터 추출
  const todayGscBlog = todayData?.gsc?.sites?.find((s) => s.label === "blog.perfectwin.ai") || null;
  const yesterdayGscBlog = yesterdayData?.gsc?.sites?.find((s) => s.label === "blog.perfectwin.ai") || null;

  // inblog 데이터 추출
  const todayInblog = todayData?.inblog || null;
  const yesterdayInblog = yesterdayData?.inblog || null;

  const dayOfWeek = getDayOfWeek(targetDate);
  const userPrompt = `아래는 PerfecTwin 블로그의 ${targetDate} (${dayOfWeek}요일) 성과 데이터다.

## 오늘 inblog 데이터
${JSON.stringify(todayInblog, null, 2)}

## 오늘 GSC 데이터 (blog.perfectwin.ai)
${JSON.stringify(todayGscBlog, null, 2)}

## 어제 inblog 데이터 (전일 비교용)
${yesterdayInblog ? JSON.stringify(yesterdayInblog, null, 2) : "어제 데이터 없음"}

## 어제 GSC 데이터 (전일 비교용)
${yesterdayGscBlog ? JSON.stringify(yesterdayGscBlog, null, 2) : "어제 데이터 없음"}

## 최근 7일 요약 (추이 맥락용)
${weekSummary.length > 0 ? JSON.stringify(weekSummary, null, 2) : "7일 데이터 없음 (초기 수집 단계)"}

이 데이터를 기반으로 블로그 일간 성과 인사이트 리포트를 작성해줘.

### 리포트 구조

반드시 아래 순서와 형식을 따른다:

#### 1. 블로그 트래픽 핵심 숫자
영문(blog-en)과 한글(blog-ko) 나누어 표시. 방문(visits), 클릭(clicks), 오가닉(organic). 각 지표의 "의미" 컬럼. 전일 대비 변화량. 블로그별 방문 내역(home, post, category, author).

#### 2. Google 검색 성과 (GSC)
노출, 클릭, CTR, 평균 포지션. "의미" 컬럼. (GSC 데이터 지연 시 actualDate 명시)

#### 3. 검색 키워드 Top 10
GSC topQueries. 키워드, 노출, 클릭, CTR, 포지션, 해석. 해석 규칙: 포지션 10이하=첫 페이지, 11~20=진입 가능, 20이상=깊은 순위. 클릭 발생 키워드 강조.

#### 4. 검색 노출 페이지 Top 10
GSC topPages. slug만 추출. 노출 많은데 클릭 0인 글 = 메타 리라이트 대상.

#### 5. 포스트별 방문 성과 (inblog)
post_id null = 비포스트 페이지. CVR은 %로 변환(0.05→5%). **포스트 제목(title)은 데이터에 있는 그대로 전체를 표시하라. 절대로 축약·의역·재구성하지 마라.**

#### 6. 유입 소스 (inblog)
소스별 방문수. 소스 설명(direct, google.com, t.co, linkedin.com, teams.cdn.office.net 등).

#### 7. 인사이트
3~6개. 비즈니스 임팩트 순 정렬. "노출은 있는데 클릭 0" 키워드/페이지 반드시 다룸. 포지션 8~15 키워드 = 첫 페이지 진입 기회. 높은 CVR 포스트 강조. 끝에 "→ 액션:" 포함.

### 형식
- 제목: "📝 블로그 일간 인사이트 — ${targetDate} (${dayOfWeek})"
- 언어: 한국어
- CVR: % 변환
- 테이블: Markdown 테이블`;

  console.log("  [리포트] 블로그 일간 생성 중...");
  const report = await callClaude(systemPrompt, userPrompt, { maxTokens: 8192 });

  ensureDir(REPORTS_DIR);
  const filePath = path.join(REPORTS_DIR, `blog-daily-${targetDate}.md`);
  fs.writeFileSync(filePath, report, "utf-8");
  console.log(`  [리포트] 저장: ${filePath}`);
  return report;
}

// ─── 통합 실행 ───────────────────────────────────────────

/**
 * 홈페이지 + 블로그 일간 인사이트 리포트를 모두 생성한다.
 * @param {string} targetDate - YYYY-MM-DD
 */
async function generateDailyReports(targetDate) {
  let homepageReport = null;
  let blogReport = null;

  try {
    homepageReport = await generateHomepageDaily(targetDate);
  } catch (err) {
    console.error(`  [리포트] 홈페이지 생성 실패: ${err.message}`);
  }

  try {
    blogReport = await generateBlogDaily(targetDate);
  } catch (err) {
    console.error(`  [리포트] 블로그 생성 실패: ${err.message}`);
  }

  return { homepage: homepageReport, blog: blogReport };
}

module.exports = { generateDailyReports, generateHomepageDaily, generateBlogDaily };

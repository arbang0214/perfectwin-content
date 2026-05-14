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
  const crossRules = loadPromptFile("cross-analysis-rules.md");
  const systemPrompt = loadPromptFile("homepage-system.md") + "\n\n" + crossRules;
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

  // Bing에서 perfectwin.ai 데이터만 추출
  const todayBingSite = todayData.bing?.sites?.find((s) => s.label === "perfectwin.ai") || null;

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

## 소셜/UTM 캠페인 데이터 (medium=social 트래픽)
${todayData.ga4?.utmCampaigns?.length ? JSON.stringify(todayData.ga4.utmCampaigns, null, 2) : "소셜 UTM 트래픽 없음"}

## 오늘 Demo Funnel (데모 신청 어트리뷰션)
${todayData.demoFunnel ? JSON.stringify(todayData.demoFunnel, null, 2) : "데모 퍼널 데이터 없음"}

## 어제 Demo Funnel (전일 비교용)
${yesterdayData?.demoFunnel ? JSON.stringify(yesterdayData.demoFunnel.summary, null, 2) : "어제 데이터 없음"}

## 오늘 Bing 검색 데이터 (perfectwin.ai)
${todayBingSite ? JSON.stringify(todayBingSite, null, 2) : "Bing 데이터 없음"}

이 데이터를 기반으로 홈페이지 일간 성과 인사이트 리포트를 작성해줘.

### 리포트 구조

반드시 아래 순서와 형식을 따른다. **1번 섹션이 리포트의 핵심이고, 인사이트(마지막 섹션)도 1번 데이터를 출발점으로 삼는다.**

#### 1. 데모 신청 어트리뷰션 (오늘 가장 중요한 신호)
demoFunnel 데이터를 기반으로 작성. 데이터 없으면 "데모 퍼널 데이터 없음" 1줄.

**1-1. 핵심 지표 테이블**
| 지표 | 오늘 | 전일 대비 |
|---|---|---|
| 데모 페이지 도달 | demoPageSessions 세션 | (변화량) |
| 데모 신청 완료 | submissions 세션 | (변화량) |
| 도달 → 완료 전환율 | conversionRate% | — |

**1-2. 데모 페이지로 데려온 콘텐츠 (intent.byLandingPage)**
데모 페이지에 도달한 사용자가 처음 진입한 페이지를 Top 10으로 정리.
- 페이지 경로, 세션 수, 페이지 타입(블로그/제품/홈 등) 분류.
- 블로그 path면 그 블로그 제목 또는 슬러그가 무엇인지 짧게 명시.
- 가장 많이 데려온 콘텐츠 Top 3에 대해 "이 콘텐츠가 왜 데모 의향까지 만들었는지" 1~2줄 해석.

**1-3. 데모 신청 완료까지 간 콘텐츠 (submit.byLandingPage)**
submit한 사용자의 첫 진입 페이지를 정리. submissions=0이면 "오늘 데모 신청 완료 없음" 1줄.
- 1-2와 같은 형식.
- 1-2(의향)와 1-3(완료) 사이 gap이 큰 페이지가 있으면 "도달은 시키지만 전환은 못 시키는 페이지"로 별도 명시 → 폼/CTA UX 개선 후보.

**1-4. 유입 채널 (submit.bySourceMedium)**
submit한 사용자의 source/medium 분포. organic vs social vs direct vs referral 비중.

**1-5. first-touch vs last-touch 비교 (submit.byFirstUserSource)**
firstUserSource와 sessionSource가 크게 다르면 "처음에는 X로 인지, 최종 전환은 Y로 발생" 패턴 명시. 같으면 1줄로만.

#### 2. 핵심 숫자 테이블
포함 지표: 방문자(activeUsers, 신규/재방문 구분), 세션, 페이지뷰, 참여율, 세션당 페이지뷰, 평균 체류 시간(N분 N초 변환). 각 지표의 "의미" 컬럼 포함. 전일 대비 변화량 (+n) 또는 (-n).

#### 3. 유입 경로 테이블
채널별 세션, 비중(%), 참여율. "이 채널은?" 컬럼에 채널 설명. 세션 2건 이상인 소스 상세 테이블 추가.

#### 4. 페이지 성과 Top 5
조회수, 사용자수, 체류시간, 이탈률. "해석" 컬럼.

#### 5. 랜딩 페이지 (첫 진입점)
세션 2건 이상만. 이탈률, 체류, 페이지/세션, 해석.

#### 6. 기기 / 국가
기기별, 상위 3개국 요약.

#### 7. 소셜/UTM 캠페인 성과
UTM 캠페인 데이터가 있을 경우에만 작성. 없으면 이 섹션 생략.
source별(linkedin-company, linkedin-personal 등) 세션, 참여율, 체류시간, 페이지뷰 비교.
campaign별로 어떤 블로그 포스트 링크가 가장 효과적이었는지 분석.
회사 포스트 vs 개인 포스트 성과 비교 포함.

#### 8. 인사이트
3~6개. **첫 인사이트는 반드시 데모 신청 어트리뷰션(섹션 1)에서 출발하라.** 그 다음은 비즈니스 임팩트 순 정렬. 각 인사이트는 아래 구조로 **충분히 자세하게** 서술:
- **현상**: 어떤 수치가 어떻게 변했는지 구체적 숫자와 함께. 전일/7일 평균 대비 비교 포함.
- **왜 이런 일이 생겼나**: 원인 분석. 어떤 채널/페이지/기기에서 발생했는지 드릴다운. 교차 지표 근거 명시.
- **비즈니스 임팩트**: 이게 우리 전환(데모 요청)이나 브랜드 인지에 어떤 영향을 주는지 ARUM이 이해할 수 있게 설명.
- **→ 액션**: 구체적으로 무엇을 해야 하는지. "SEO 개선" 같은 모호한 표현 금지. "어떤 페이지의 어떤 요소를 어떻게 수정" 수준.

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
  const crossRules = loadPromptFile("cross-analysis-rules.md");
  const systemPrompt = loadPromptFile("blog-system.md") + "\n\n" + crossRules;
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

  // Bing blog 데이터 추출
  const todayBingBlog = todayData?.bing?.sites?.find((s) => s.label === "blog.perfectwin.ai") || null;
  const todayBingKoBlog = todayData?.bing?.sites?.find((s) => s.label === "ko.blog.perfectwin.ai") || null;

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

## 오늘 Bing 검색 데이터 (blog.perfectwin.ai)
${todayBingBlog ? JSON.stringify(todayBingBlog, null, 2) : "Bing 데이터 없음"}

## 오늘 Bing 검색 데이터 (ko.blog.perfectwin.ai)
${todayBingKoBlog ? JSON.stringify(todayBingKoBlog, null, 2) : "Bing 데이터 없음"}

## 오늘 Demo Funnel (데모 신청 어트리뷰션 — 어느 블로그가 데모 보냈는가)
${todayData?.demoFunnel ? JSON.stringify(todayData.demoFunnel, null, 2) : "데모 퍼널 데이터 없음"}

이 데이터를 기반으로 블로그 일간 성과 인사이트 리포트를 작성해줘.

### 리포트 구조

반드시 아래 순서와 형식을 따른다. **1번 섹션이 리포트의 핵심이고, 인사이트(마지막 섹션)도 1번 데이터를 출발점으로 삼는다.**

#### 1. 데모 신청 기여 콘텐츠 (오늘 가장 중요한 신호)
demoFunnel 데이터를 기반으로 작성. 데이터 없으면 "데모 퍼널 데이터 없음" 1줄.

**1-1. 핵심 지표 테이블**
| 지표 | 오늘 | 전일 대비 |
|---|---|---|
| 데모 페이지 도달 | demoPageSessions 세션 | (변화량) |
| 데모 신청 완료 | submissions 세션 | (변화량) |
| 도달 → 완료 전환율 | conversionRate% | — |

**1-2. 데모 페이지로 데려온 블로그 (intent.byLandingPage)**
intent.byLandingPage Top 10에서 **블로그 경로(/blog-en/..., /blog-ko/...)만 필터링**하여 표로 정리.
- 블로그 slug · 세션 수 · 같은 날 inblog 방문수와 비교한 "방문 → 데모 페이지 도달" 강도.
- 블로그 카테고리 분류(A: 마이그레이션, B: 테스트자동화, C: 경쟁사, D: 트렌드)도 함께 표기.
- 비블로그 path(/, /pricing 등)는 별도 합계 1줄로만.
- 가장 많이 데려온 블로그 Top 3에 대해 "이 콘텐츠가 왜 데모 의향까지 만들었는지" 1~2줄 해석.

**1-3. 데모 신청 완료까지 간 블로그 (submit.byLandingPage)**
submissions=0이면 "오늘 데모 신청 완료 없음" 1줄.
≥1이면 submit.byLandingPage에서 블로그 path만 추출하여 표 정리. 1-2와 같은 컬럼 구조.
1-2(의향)와 1-3(완료) 사이 gap이 큰 블로그가 있으면 "도달은 시키지만 데모 완료까진 못 가는 블로그" 명시 → 본문 CTA·메시지 점검 후보.

**1-4. 다음 콘텐츠 의사결정용 패턴 (1~2문장)**
어떤 주제/각도/카테고리가 데모로 잘 이어졌는가. 다음 주 블로그 주제 선정에 직접 사용될 신호 1~2개.

#### 2. 블로그 트래픽 핵심 숫자
영문(blog-en)과 한글(blog-ko) 나누어 표시. 방문(visits), 클릭(clicks), 오가닉(organic). 각 지표의 "의미" 컬럼. 전일 대비 변화량. 블로그별 방문 내역(home, post, category, author).

#### 3. Google 검색 성과 (GSC)
노출, 클릭, CTR, 평균 포지션. "의미" 컬럼. (GSC 데이터 지연 시 actualDate 명시)

#### 4. 검색 키워드 Top 10
GSC topQueries. 키워드, 노출, 클릭, CTR, 포지션, 해석. 해석 규칙: 포지션 10이하=첫 페이지, 11~20=진입 가능, 20이상=깊은 순위. 클릭 발생 키워드 강조.

#### 5. 검색 노출 페이지 Top 10
GSC topPages. slug만 추출. 노출 많은데 클릭 0인 글 = 메타 리라이트 대상.

#### 6. 포스트별 방문 성과 (inblog)
post_id null = 비포스트 페이지. CVR은 %로 변환(0.05→5%). **포스트 제목(title)은 데이터에 있는 그대로 전체를 표시하라. 절대로 축약·의역·재구성하지 마라.**

#### 7. 유입 소스 (inblog)
소스별 방문수. 소스 설명(direct, google.com, t.co, linkedin.com, teams.cdn.office.net 등).

#### 7-1. LinkedIn 유입 상세
포스트별 데이터에 linkedinVisits 필드가 있다. 1건 이상인 포스트를 테이블로 정리.
포스트별 LinkedIn 유입수, 전체 방문 대비 LinkedIn 비율, 어떤 포스트가 LinkedIn에서 가장 많이 읽혔는지 분석.
linkedinVisits가 모두 0이면 이 섹션 생략.

#### 8. 인사이트
3~6개. **첫 인사이트는 반드시 데모 신청 기여 콘텐츠(섹션 1)에서 출발하라.** 그 다음은 비즈니스 임팩트 순 정렬. "노출은 있는데 클릭 0" 키워드/페이지 반드시 다룸. 포지션 8~15 키워드 = 첫 페이지 진입 기회. 높은 CVR 포스트 강조.
각 인사이트는 아래 구조로 **충분히 자세하게** 서술:
- **현상**: 어떤 수치가 어떻게 변했는지 구체적 숫자와 함께. 전일/7일 평균 대비 비교 포함.
- **왜 이런 일이 생겼나**: 원인 분석. 어떤 키워드/포스트/소스에서 발생했는지 드릴다운. 교차 지표(inblog ↔ GSC) 근거 명시.
- **비즈니스 임팩트**: 이게 SEO 성장이나 리드 확보에 어떤 영향을 주는지 ARUM이 이해할 수 있게 설명.
- **→ 액션**: 구체적으로 무엇을 해야 하는지. "메타 수정" 같은 모호한 표현 금지. "어떤 포스트의 메타 디스크립션을 어떤 방향으로 수정" 수준.

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

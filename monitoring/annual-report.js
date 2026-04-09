#!/usr/bin/env node
/**
 * 연간 종합 분석 리포트 생성기
 *
 * 사용법:
 *   node monitoring/annual-report.js --from 2025-03-27 --to 2026-03-26
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const fs = require("fs");
const { aggregateAnnual } = require("./annual-aggregator");
const { callClaude } = require("../scripts/lib/claude-api");
const { sendReportToSlack } = require("./utils/slack-sender");

const REPORTS_DIR = path.join(__dirname, "..", "data", "monitoring", "reports");
const PROMPTS_DIR = path.join(__dirname, "prompts");

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from" && args[i + 1]) parsed.from = args[++i];
    if (args[i] === "--to" && args[i + 1]) parsed.to = args[++i];
  }
  if (!parsed.from || !parsed.to) {
    console.error("Usage: node monitoring/annual-report.js --from YYYY-MM-DD --to YYYY-MM-DD");
    process.exit(1);
  }
  return parsed;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── 시스템 프롬프트 ─────────────────────────────────────

const SYSTEM_PROMPT = `너는 PerfecTwin(SAP 테스트 자동화 B2B SaaS)의 시니어 마케팅 데이터 분석가다.

PerfecTwin에 대해:
- SAP ERP 테스트 자동화 플랫폼. B2B SaaS.
- 타겟: SAP를 사용하는 엔터프라이즈 기업의 테스트/QA 팀, IT 의사결정자.
- 주요 차별화: 50x 빠른 백엔드 직접 실행, No-code 드래그앤드롭, 실 프로덕션 데이터 추출(Data Extractor).
- 경쟁사: Tricentis Tosca, Opkey, ACCELQ, Leapwork, Worksoft, aqua cloud, UiPath.
- 홈페이지: perfectwin.ai
- 영문 블로그: blog.perfectwin.ai (인블로그 플랫폼, 메인)
- 한글 블로그: ko.blog.perfectwin.ai (인블로그 플랫폼)
- 콘텐츠 채널: 블로그, LinkedIn 회사/개인, X (Twitter)
- 콘텐츠 마케팅 초기~성장 단계.

홈페이지 주요 페이지:
- / : 메인 홈
- /why-perfectwin : 차별화 포인트
- /product/erp : 제품 상세
- /solutions : SAP S/4HANA 테스트 솔루션
- /resources/blog : 블로그 목록
- /contact-us/request-demo : 데모 요청 (= 전환 목표)
- /about-us : 회사 소개

블로그 콘텐츠 카테고리:
- A: S/4HANA 마이그레이션 + 테스트 (시장 긴급성 최고)
- B: SAP 테스트 자동화 실무 (실전 검색 의도)
- C: 경쟁사 페인포인트 공략 (Tosca 전환 의도)
- D: 트렌드/Thought Leadership (브랜드 인지도)

리포트 대상(ARUM):
- PerfecTwin의 1인 워킹데이터 PM. 마케팅/SEO 초보에서 중급으로 성장 중.
- 데이터를 보고 "그래서 뭘 해야 하지?"까지 연결되는 리포트를 원한다.
- 이 리포트로 경영진에게 콘텐츠 마케팅의 성과와 방향을 보고할 예정.

데이터 소스:
1. GA4: perfectwin.ai 홈페이지 트래픽, 참여도, 유입 경로, 페이지 성과
2. GSC (perfectwin.ai): 홈페이지 검색 노출/클릭/순위
3. GSC (blog.perfectwin.ai): 블로그 검색 노출/클릭/순위
4. inblog: 블로그 자체 통계 — 방문수, 클릭(CTA), 오가닉 유입, 유입 소스

분석 톤 & 태도:
- 객관적·비판적 시각을 유지하라. 긍정 편향 금지.
- 단일 지표만으로 "좋다/나쁘다" 판단하지 마라. 반드시 2개 이상 교차 확인 후 해석.
- 양(volume) 지표는 반드시 질(quality) 지표와 짝으로 봐라 (sessions ↔ engagementRate, impressions ↔ position, visits ↔ clicks).
- 같은 대상을 다른 소스로 검증하라 (GA4 organic ↔ GSC clicks, inblog organic ↔ GSC clicks).
- "관심도 높다"는 표현은 engagementRate > 50% + pageViewsPerSession > 1.5일 때만 허용.
- 체류시간이 긴데 engagementRate 낮고 pageViewsPerSession = 1이면 "방치 탭 가능성"을 반드시 명시.
- impressions가 높아도 position > 20이면 "사실상 미노출"로 해석.
- CTR/CVR은 모수가 10 미만이면 "표본 부족"으로 표기.
- 문제점과 리스크를 먼저 짚고, 그 다음에 긍정적 신호를 다뤄라.
- "~한 것으로 보인다" 같은 모호한 표현 대신 데이터 근거와 함께 단정적으로 해석하라.`;

// ─── 사용자 프롬프트 빌더 ────────────────────────────────

function buildUserPrompt(data, focus) {
  // focus: "homepage" → GA4 + GSC(perfectwin.ai) 중심
  //        "blog" → inblog + GSC(blog.perfectwin.ai) 중심
  const { period, totalDays, months, monthly, annual } = data;

  // 월별 GA4 트렌드 테이블 데이터
  const monthlyGA4 = months.map((m) => {
    const g = monthly[m]?.ga4;
    if (!g) return { month: m, users: 0, sessions: 0, pageViews: 0, engagementRate: 0, avgDuration: 0 };
    return {
      month: m,
      users: g.totals.activeUsers,
      sessions: g.totals.sessions,
      pageViews: g.totals.pageViews,
      engagementRate: g.averages.engagementRate,
      avgDuration: g.averages.avgSessionDuration,
      newUsers: g.totals.newUsers,
      channels: g.channels?.slice(0, 5),
    };
  });

  // 월별 GSC 트렌드
  const monthlyGSC = months.map((m) => {
    const g = monthly[m]?.gsc || {};
    const site = g["perfectwin.ai"];
    const blog = g["blog.perfectwin.ai"];
    return {
      month: m,
      site: site?.totals || null,
      blog: blog?.totals || null,
    };
  });

  // 월별 inblog 트렌드
  const monthlyInblog = months.map((m) => {
    const ib = monthly[m]?.inblog || {};
    return {
      month: m,
      en: ib["blog-en"]?.totals || null,
      ko: ib["blog-ko"]?.totals || null,
    };
  });

  if (focus === "homepage") {
    return buildHomepageAnnualPrompt(period, totalDays, monthlyGA4, monthlyGSC, annual);
  } else {
    return buildBlogAnnualPrompt(period, totalDays, monthlyGSC, monthlyInblog, annual);
  }
}

function buildHomepageAnnualPrompt(period, totalDays, monthlyGA4, monthlyGSC, annual) {
  return `아래는 PerfecTwin 홈페이지의 ${period.from} ~ ${period.to} (${totalDays}일) 연간 성과 데이터다.

## 월별 GA4 트래픽
${JSON.stringify(monthlyGA4, null, 2)}

## 연간 GA4 집계
${JSON.stringify(annual.ga4, null, 2)}

## 월별 GSC 검색 성과 (perfectwin.ai)
${JSON.stringify(monthlyGSC.map((m) => ({ month: m.month, site: m.site })), null, 2)}

## 연간 GSC 집계 (perfectwin.ai)
${JSON.stringify(annual.gsc?.["perfectwin.ai"] || null, null, 2)}

## 요일별 패턴
${JSON.stringify(annual.dayOfWeek, null, 2)}

---

이 1년치 데이터를 기반으로 홈페이지 연간 분석 리포트를 작성해줘. 반드시 아래 구조와 규칙을 따른다.

# 리포트 구조

## 1. 요약 (Executive Summary)
- 1년간 핵심 지표 변화를 2~3줄로 요약. "가장 중요한 발견 3가지" 번호 매겨 제시.

## 2. 월별 트래픽 추이
방문자, 세션, 페이지뷰 월별 테이블. 성장기/정체기/하락기 구간 식별.

## 3. 월별 참여도 추이
참여율, 체류시간, 세션당 페이지뷰 월별 테이블. 트래픽 양 vs 질 분석.

## 4. 유입 채널 분석
채널별 연간 비중. 월별 채널 변화. Organic Search/Social 성장 여부.

## 5. Top 페이지 연간 순위
상위 10개 페이지. 전환 퍼널(인지→관심→전환) 관점.

## 6. 기기/국가 분포
기기별 세션/참여율. 상위 국가별 분석. 타겟 시장 평가.

## 7. 요일별 패턴
요일별 평균 세션 테이블. 콘텐츠 발행 최적 타이밍 제안.

## 8. 검색 성과 (perfectwin.ai GSC)
월별 노출/클릭/CTR/순위. 핵심 키워드 Top 15. 핵심 페이지 Top 15.

## 9. 종합 인사이트
각 항목을 **충분히 자세하게** 서술. 수치 근거 + 원인 분석 + 비즈니스 임팩트 + 구체적 액션을 빠짐없이 포함.
### 9-1. 가장 효과적이었던 것 (3~5개) — 어떤 수치가 얼마나 좋았는지, 왜 효과적이었는지 원인 분석, 이 성과를 강화하려면 구체적으로 무엇을 해야 하는지
### 9-2. 개선이 필요한 것 (3~5개) — 어떤 수치가 어떻게 나빴는지, 근본 원인은 무엇인지 교차 지표로 분석, 구체적 개선 액션(어떤 페이지/채널/콘텐츠를 어떻게)
### 9-3. 놓치고 있는 기회 (2~3개) — 데이터에서 발견되는 미개척 영역, 왜 기회인지, 실행하면 기대되는 효과
### 9-4. 다음 분기 우선순위 (3~5개) — 무엇을/왜/기대효과/첫 액션. 우선순위 근거를 데이터로 설명

# 형식
- 제목: "📊 홈페이지 연간 분석 리포트 — ${period.from} ~ ${period.to}"
- 한국어, Markdown 테이블, 경영진 보고 수준, 충분히 상세하게
- 모든 주장에 데이터 근거 명시`;
}

function buildBlogAnnualPrompt(period, totalDays, monthlyGSC, monthlyInblog, annual) {
  return `아래는 PerfecTwin 블로그의 ${period.from} ~ ${period.to} (${totalDays}일) 연간 성과 데이터다.

## 월별 inblog 트래픽 (영문/한글)
${JSON.stringify(monthlyInblog, null, 2)}

## 연간 inblog 집계
${JSON.stringify(annual.inblog, null, 2)}

## 월별 GSC 검색 성과 (blog.perfectwin.ai)
${JSON.stringify(monthlyGSC.map((m) => ({ month: m.month, blog: m.blog })), null, 2)}

## 연간 GSC 집계 (blog.perfectwin.ai)
${JSON.stringify(annual.gsc?.["blog.perfectwin.ai"] || null, null, 2)}

---

이 1년치 데이터를 기반으로 블로그 연간 분석 리포트를 작성해줘. 반드시 아래 구조와 규칙을 따른다.

# 리포트 구조

## 1. 요약 (Executive Summary)
- 1년간 블로그 핵심 지표 변화 2~3줄 요약. "가장 중요한 발견 3가지".

## 2. 월별 트래픽 추이 (영문/한글 각각)
방문, 클릭, 오가닉 월별 테이블. 영문 vs 한글 성장 비교.

## 3. 오가닉 유입 + SEO 효과 분석
오가닉 비중 변화. SEO 성장 곡선 분석.

## 4. 유입 소스 분석
연간 유입 소스 Top 10. 어떤 배포 채널이 실제로 블로그 트래픽을 만드는지.

## 5. 검색 성과 (blog.perfectwin.ai GSC)
월별 노출/클릭/CTR/순위. SEO 성장 곡선: 노출→클릭 전환 여부.

## 6. 핵심 검색 키워드 분석
연간 노출 Top 15. 카테고리 분류(A:마이그레이션, B:테스트자동화, C:경쟁사, D:트렌드). 카테고리별 노출/클릭/순위.

## 7. 검색 상위 페이지 분석
연간 노출 Top 15 페이지. "노출 많고 클릭 0" → 메타 리라이트 우선순위. "순위 8~15" → 첫 페이지 진입 가능.

## 8. 종합 인사이트
각 항목을 **충분히 자세하게** 서술. 수치 근거 + 원인 분석 + 비즈니스 임팩트 + 구체적 액션을 빠짐없이 포함.
### 8-1. 가장 효과적이었던 것 (3~5개) — 어떤 수치가 얼마나 좋았는지, 왜 효과적이었는지 원인 분석, 이 성과를 강화하려면 구체적으로 무엇을 해야 하는지
### 8-2. 개선이 필요한 것 (3~5개) — 어떤 수치가 어떻게 나빴는지, 근본 원인은 무엇인지 교차 지표로 분석, 구체적 개선 액션(어떤 포스트/키워드/소스를 어떻게)
### 8-3. 놓치고 있는 기회 (2~3개) — 데이터에서 발견되는 미개척 영역, 왜 기회인지, 실행하면 기대되는 효과
### 8-4. 다음 분기 콘텐츠 우선순위 (3~5개) — 검색 데이터 근거 필수. 우선순위 근거를 데이터로 설명

# 형식
- 제목: "📝 블로그 연간 분석 리포트 — ${period.from} ~ ${period.to}"
- 한국어, Markdown 테이블, 경영진 보고 수준, 충분히 상세하게
- 모든 주장에 데이터 근거 명시`;
}

// ─── 메인 ────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  console.log(`\n📊 연간 종합 분석 리포트 생성`);
  console.log(`   기간: ${args.from} ~ ${args.to}\n`);

  // 1. 데이터 집계
  console.log("[1/3] 데이터 집계...");
  const aggregated = aggregateAnnual(args.from, args.to);

  // 집계 데이터도 저장 (디버깅/재사용)
  ensureDir(REPORTS_DIR);
  const aggregatedPath = path.join(REPORTS_DIR, `annual-data-${args.from}_${args.to}.json`);
  fs.writeFileSync(aggregatedPath, JSON.stringify(aggregated, null, 2), "utf-8");
  console.log(`  집계 데이터 저장: ${aggregatedPath}`);

  // 교차 해석 규칙 로드
  const crossRules = fs.readFileSync(path.join(PROMPTS_DIR, "cross-analysis-rules.md"), "utf-8");
  const fullSystemPrompt = SYSTEM_PROMPT + "\n\n" + crossRules;

  // 2. 홈페이지 연간 리포트
  console.log("[2/5] 홈페이지 연간 리포트 생성 중...");
  const homepagePrompt = buildUserPrompt(aggregated, "homepage");
  const homepageReport = await callClaude(fullSystemPrompt, homepagePrompt, { maxTokens: 16000 });
  const hpPath = path.join(REPORTS_DIR, `homepage-annual-${args.from}_${args.to}.md`);
  fs.writeFileSync(hpPath, homepageReport, "utf-8");
  console.log(`  ✅ ${hpPath}`);

  // 3. 블로그 연간 리포트
  console.log("[3/5] 블로그 연간 리포트 생성 중...");
  const blogPrompt = buildUserPrompt(aggregated, "blog");
  const blogReport = await callClaude(fullSystemPrompt, blogPrompt, { maxTokens: 16000 });
  const bpPath = path.join(REPORTS_DIR, `blog-annual-${args.from}_${args.to}.md`);
  fs.writeFileSync(bpPath, blogReport, "utf-8");
  console.log(`  ✅ ${bpPath}`);

  // 4. Slack 발송 (요약 20줄)
  console.log("[4/5] Slack 발송...");
  await sendReportToSlack(homepageReport, "annual", args.from);
  await sendReportToSlack(blogReport, "annual", args.from);

  console.log(`\n✅ 연간 종합 분석 리포트 생성 완료!\n`);
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});

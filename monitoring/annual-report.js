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

const REPORTS_DIR = path.join(__dirname, "..", "data", "monitoring", "reports");

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
4. inblog: 블로그 자체 통계 — 방문수, 클릭(CTA), 오가닉 유입, 유입 소스`;

// ─── 사용자 프롬프트 빌더 ────────────────────────────────

function buildUserPrompt(data) {
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

  return `아래는 PerfecTwin의 ${period.from} ~ ${period.to} (${totalDays}일) 종합 성과 데이터다.

## 월별 GA4 홈페이지 트래픽
${JSON.stringify(monthlyGA4, null, 2)}

## 연간 GA4 집계
${JSON.stringify(annual.ga4, null, 2)}

## 월별 GSC 검색 성과 (perfectwin.ai + blog.perfectwin.ai)
${JSON.stringify(monthlyGSC, null, 2)}

## 연간 GSC 집계
${JSON.stringify(annual.gsc, null, 2)}

## 월별 inblog 블로그 트래픽
${JSON.stringify(monthlyInblog, null, 2)}

## 연간 inblog 집계
${JSON.stringify(annual.inblog, null, 2)}

## 요일별 패턴 (연간 평균)
${JSON.stringify(annual.dayOfWeek, null, 2)}

---

이 1년치 데이터를 기반으로 종합 분석 리포트를 작성해줘. 반드시 아래 구조와 규칙을 따른다.

# 리포트 구조

## 1. 요약 (Executive Summary)
- 1년간 핵심 지표 변화를 2~3줄 핵심 문장으로 요약
- "가장 중요한 발견 3가지"를 번호 매겨 제시. 각각 구체적 수치 포함.
- ARUM이 경영진에게 바로 보고할 수 있는 수준의 명확한 요약.

## 2. 홈페이지 성과 (GA4)

### 2-1. 월별 트래픽 추이
- 방문자, 세션, 페이지뷰 월별 테이블
- 추이 분석: 성장기/정체기/하락기 구간 식별, 원인 추정

### 2-2. 월별 참여도 추이
- 참여율, 이탈률, 체류시간, 세션당 페이지뷰 월별 테이블
- 트래픽 양 vs 질의 상관관계 분석

### 2-3. 유입 채널 분석
- 채널별 연간 세션 비중 테이블
- 월별 채널 비중 변화 (특히 Organic Search, Organic Social의 성장/하락)
- 각 채널의 의미와 건강도 평가

### 2-4. Top 페이지 연간 순위
- 상위 10개 페이지 조회수/사용자 테이블
- 전환 퍼널 관점 분석: 인지(홈)→관심(why-perfectwin, product)→전환(request-demo) 흐름

### 2-5. 기기/국가별 분포
- 기기별 세션 비중, 참여율 차이
- 상위 국가별 세션, 참여율. 타겟 시장 vs 비타겟 시장 분석.

### 2-6. 요일별 패턴
- 요일별 평균 세션/사용자 테이블
- B2B 사이트에 적합한 패턴인지 분석
- 콘텐츠/소셜 발행 최적 타이밍 제안

## 3. 검색 성과 (GSC)

### 3-1. 홈페이지 검색 추이 (perfectwin.ai)
- 월별 노출/클릭/CTR/순위 테이블 (데이터 있는 달만)
- 브랜드 검색 vs 비브랜드 검색 식별 (키워드에서 'perfectwin' 포함 여부)

### 3-2. 블로그 검색 추이 (blog.perfectwin.ai)
- 월별 노출/클릭/CTR/순위 테이블
- SEO 성장 곡선 분석: 노출 성장 → 클릭 전환이 이루어지고 있는지

### 3-3. 핵심 검색 키워드 분석
- 연간 누적 노출 Top 15 키워드 테이블 (클릭, 순위 포함)
- 키워드를 카테고리별로 분류:
  - 브랜드 키워드 (perfectwin 포함)
  - SAP 마이그레이션 관련
  - SAP 테스트 관련
  - 경쟁사 관련
  - 기타
- 각 카테고리의 노출/클릭 비중, 평균 순위 분석

### 3-4. 검색 상위 페이지 분석
- 연간 노출 Top 15 페이지 테이블
- "노출 많지만 클릭 0" 페이지 식별 → 메타 리라이트 우선순위
- "순위 8~15" 페이지 식별 → 첫 페이지 진입 가능 콘텐츠

## 4. 블로그 성과 (inblog)

### 4-1. 월별 트래픽 추이
- 영문/한글 블로그 각각 월별 방문/클릭/오가닉 테이블
- 영문 vs 한글 블로그 성장 비교

### 4-2. 콘텐츠 유형별 분석
- 포스트 페이지 vs 홈/카테고리 페이지 비중 변화
- 오가닉 유입 비중 변화 (SEO 효과 지표)

### 4-3. 유입 소스 분석
- 연간 유입 소스 Top 10 테이블
- 소스별 의미 해석 (direct, google, t.co, linkedin, teams 등)
- 어떤 배포 채널이 실제로 블로그 트래픽을 만들어내는지

## 5. 종합 인사이트

이 섹션이 리포트의 핵심이다. 단순 수치 나열이 아니라, 1년간의 데이터에서 도출되는 전략적 시사점을 깊이 있게 분석한다.

### 5-1. 가장 효과적이었던 것 (3~5개)
- 구체적 수치를 근거로 무엇이 효과가 있었는지
- 왜 효과가 있었는지 추정
- 이것을 더 강화하려면 어떻게 해야 하는지

### 5-2. 개선이 필요한 것 (3~5개)
- 기대 대비 성과가 부족한 영역
- 구체적으로 무엇이 문제이고, 어떤 수치가 이를 증명하는지
- 개선을 위한 구체적 액션 제안

### 5-3. 놓치고 있는 기회 (2~3개)
- 데이터에서 발견되는 미개척 기회
- 예: 특정 키워드의 검색량은 있지만 콘텐츠가 없는 영역
- 예: 특정 유입 채널의 참여율이 높지만 볼륨이 작은 영역

### 5-4. 다음 분기 우선순위 제안
번호를 매겨 우선순위 순으로 3~5개 제안:
- 각 제안에 (1) 무엇을 (2) 왜 (3) 기대 효과 (4) 구체적 첫 번째 액션
- 데이터에 근거한 제안만. 일반적인 마케팅 조언 금지.

# 리포트 형식 규칙
- 제목: "📊 PerfecTwin 연간 종합 분석 리포트 — {from} ~ {to}"
- 언어: 한국어
- 숫자: 천 단위 쉼표, 소수 1자리
- 체류 시간: "N분 N초"
- 테이블: Markdown 테이블
- 인사이트에는 항상 구체적 수치 포함
- 모든 주장에 데이터 근거 명시
- 추정/가설은 "~로 추정된다", "~일 가능성이 있다"로 명확히 표시
- 분량: 충분히 상세하게. 이것은 경영진 보고용 연간 리포트다.`;
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

  // 2. Claude API로 리포트 생성
  console.log("[2/3] Claude API로 리포트 생성 중 (시간이 걸릴 수 있습니다)...");
  const userPrompt = buildUserPrompt(aggregated);
  const report = await callClaude(SYSTEM_PROMPT, userPrompt, { maxTokens: 16000 });

  // 3. 파일 저장
  console.log("[3/3] 리포트 저장...");
  const mdPath = path.join(REPORTS_DIR, `annual-review-${args.from}_${args.to}.md`);
  fs.writeFileSync(mdPath, report, "utf-8");
  console.log(`  ✅ MD 리포트: ${mdPath}`);

  console.log(`\n✅ 연간 종합 분석 리포트 생성 완료!\n`);
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});

# 📊 PerfecTwin 모니터링 — 수집 데이터 가이드

매일 KST 08:43에 자동 수집되어 일간/주간 리포트에 활용되는 데이터의 출처와 의미입니다. 이 채널의 리포트를 읽을 때 참고해주세요.

---

## 1️⃣ GA4 (Google Analytics 4) — 홈페이지 트래픽

**대상**: perfectwin.ai (메인 홈페이지)
**출처**: Google Analytics 데이터 API

수집 지표:
- **방문자(Active Users)** — 그날 사이트에 들른 고유 사람 수. 신규/재방문 구분
- **세션(Sessions)** — 방문 횟수. 30분 비활성 후 새 세션으로 카운트
- **페이지뷰(Page Views)** — 페이지를 본 총 횟수
- **참여율(Engagement Rate)** — 10초+ 머물거나 2+ 페이지 본 세션 비율. **50% 이상이면 콘텐츠가 잘 통한다는 신호**
- **세션당 페이지뷰** — 한 방문당 평균 페이지 수. 1.5+ 탐색 의향
- **평균 체류 시간** — 한 세션 평균 사이트 머문 시간. 2분+ 좋음
- **유입 채널** — Organic Search, Direct, Referral, Social 등 채널 그룹별 세션
- **유입 Source/Medium** — 어디서(google, linkedin.com) / 어떻게(organic, referral, social) 왔는지
- **Top 페이지** — 어느 페이지가 가장 많이 조회됐나
- **랜딩 페이지** — 사용자가 가장 먼저 본 페이지
- **기기·국가 분포** — desktop/mobile/tablet, 국가별

---

## 2️⃣ GSC (Google Search Console) — 구글 검색

**대상**: perfectwin.ai · blog.perfectwin.ai · ko.blog.perfectwin.ai
**출처**: Google Search Console API

수집 지표:
- **노출(Impressions)** — 구글 검색 결과에 우리 페이지가 보인 횟수
- **클릭(Clicks)** — 검색 결과에서 실제 클릭된 횟수
- **CTR(Click-Through Rate)** — 클릭/노출 비율. 평균 2~3%, **5% 이상 좋음**
- **평균 순위(Position)** — 검색 결과에서 우리 평균 위치. **10 이하 = 첫 페이지**, 11~20 = 둘째 페이지(클릭 급락), 20 초과 = 사실상 미노출
- **검색어 Top** — 어떤 키워드로 우리가 노출·클릭되는지
- **페이지 Top** — 어떤 페이지가 검색에서 가장 많이 노출되는지
- **기기·국가별 검색 성과**

> ⚠️ GSC는 보통 1~2일 데이터 지연이 있어, 리포트에 `actualDate` 필드로 명시됩니다.

---

## 3️⃣ Bing Webmaster Tools — Bing 검색

**대상**: perfectwin.ai · blog.perfectwin.ai · ko.blog.perfectwin.ai
**출처**: Bing Webmaster Tools API

수집 지표:
- 클릭, 노출, CTR, 평균 순위 (GSC와 동일 개념)
- Bing 검색어 Top 10

> 페이지별 검색 성과는 GSC만 수집 중 (Bing은 검색어만).

---

## 4️⃣ inblog — 블로그 자체 통계

**대상**: blog.perfectwin.ai (영문) · ko.blog.perfectwin.ai (한글)
**출처**: 인블로그 플랫폼 자체 Analytics API

수집 지표:
- **visits** — 블로그 방문 횟수
- **post** — 실제 포스트 페이지를 본 횟수 (홈/카테고리 제외)
- **organic** — 검색엔진에서 자연 유입된 방문
- **clicks(CTA 클릭)** — 블로그 본문 안의 버튼·링크 클릭 수. **CTA = Call To Action**, "데모 신청하기" 같은 행동 유도 요소
- **포스트별 성과 Top 10** — 어떤 포스트가 가장 많이 읽혔나 (제목·슬러그 포함)
- **유입 소스(referrer)** — 어디서 블로그로 왔는지. 예: google.com(검색), linkedin.com(LinkedIn 공유), teams.cdn.office.net(MS Teams 공유), direct(즐겨찾기·URL 직접)
- **포스트별 LinkedIn 유입** — 각 포스트가 LinkedIn에서 얼마나 읽혔는지
- **슬러그→제목 매핑** — 다른 데이터 소스(GSC·데모 퍼널)에서 슬러그만 나올 때 블로그 제목으로 변환

---

## 5️⃣ Demo Funnel — 데모 신청 어트리뷰션 (콘텐츠 의사결정의 핵심)

**대상**: perfectwin.ai 도메인 안의 데모 신청 페이지
**출처**: GA4 (페이지 경로 필터링)

수집 지표:
- **demoPageSessions(도달)** — `/contact-us/request-demo` 페이지를 본 세션 수. "관심 있음" 신호
- **submissions(완료)** — `/contact-us/thankyou` 페이지 도달 = **실제 영업팀에 메일이 가는 시점 = 리드 발생**
- **conversionRate(전환율)** — 도달자 중 실제 제출 비율. 정상 5~10%
- **submit.byLandingPage** — submit한 사용자의 **첫 진입 페이지**. "어떤 블로그·메뉴가 데모로 보냈는지"의 가장 강한 신호 (콘텐츠 어트리뷰션의 핵심)
- **submit.bySourceMedium** — submit한 세션의 source/medium 분포. 예: google/organic, linkedin.com/referral, teams.cdn.office.net/referral
- **submit.byCampaign** — UTM 캠페인별 (UTM 표준화 이후 의미 있어짐)
- **submit.byFirstUserSource** — first-touch(처음 접한 채널) vs last-touch(전환 직전 채널) 비교용
- **intent.byLandingPage** — 데모 페이지까진 갔지만 submit 안 한 사용자의 첫 진입 페이지 (CTA·폼 UX 개선 후보)

---

## 📦 데이터 흐름

```
매일 KST 08:43 cron
  ↓
[수집] GA4 · GSC · Bing · inblog · Demo Funnel
  ↓
[저장] data/monitoring/{날짜}.json (스냅샷, git에 commit됨)
  ↓
[해석] Claude API로 통합 일간 인사이트 리포트 생성
  ↓
[발송] Slack 단일 메시지 (이 채널)

매주 금요일 KST 08:43
  ↓ (위와 동일 흐름, 단 5일 누적 집계로 주간 리포트 생성)
```

---

## ⚠️ 알아두면 좋은 한계

- **모바일 앱 referer 누락** — Teams/Slack 모바일 앱에서 클릭하면 referer 헤더가 비어있어 `direct`로 분류될 수 있음. 실제 Teams/Slack 유입은 표시값보다 더 많을 수 있음 (과소집계)
- **GSC 1~2일 지연** — 오늘 리포트에 어제 데이터가 아닌 그저께 데이터가 들어올 수 있음 (actualDate로 명시됨)
- **트래픽 모수가 작은 단계** — 일평균 100명 미만 구간이라 단일 일자 변동은 노이즈일 수 있음. 7일·주간 추세 함께 보는 게 신뢰성 ↑
- **표본 부족 경고** — 클릭 수나 노출 수가 10건 미만이면 "표본 부족"으로 표기되어 과해석 방지

---

## 📍 리포트 보는 순서 추천

1. **헤드라인(⚡)** — 30초 스캔. 오늘 데모 신청 몇 건, 전일 대비 어떤지
2. **데모 퍼널(1️⃣)** — 어떤 콘텐츠가 리드로 이어졌는지. **이번 주 콘텐츠 우선순위 판단의 1차 근거**
3. **종합 인사이트(4️⃣)** — 액션 가이드
4. (시간 있을 때) 홈페이지·블로그 섹션 상세

질문 있으면 ARUM에게 DM 주세요.

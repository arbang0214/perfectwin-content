# 🧪 UTM 트래킹 파일럿 + 일간 리포트 확장 — 진행 보고

**작업일**: 2026-05-15
**작성자**: ARUM
**다음 검증**: 2026-05-16 KST 08:43 자동 리포트

---

## ⚡ 한 줄 요약

블로그 → 홈페이지 클릭이 데모 신청까지 이어지는지 추적하기 위해 UTM 파일럿 4개 포스트 적용 + 일간 리포트에 "데모 퍼널" / "콘텐츠 행동 퍼널" 섹션 신설. 8개 직접 클릭 세션 + 2개 LinkedIn 경유 세션 = 총 10개 테스트로 검증 데이터 만듦. 내일 자동 리포트에서 결과 확인 + GA4 attribution 동작 함께 검증 예정.

---

## 1️⃣ UTM 설정 — 파일럿 4개 포스트

**선정 기준**: Organic Search 유입 Top 기준으로 영어 블로그 2개 + 한글 블로그 2개 선정.

### UTM 스키마
```
utm_source   = blog | ko_blog     (영어/한글 구분)
utm_medium   = blog_cta            (블로그 CTA 통일)
utm_campaign = {post-slug}         (글마다 다름)
utm_content  = link | button       (본문 인라인 / CTA 버튼 구분)
```

### 적용 포스트 (각 포스트당 link + button 2종 = 총 8개 URL)

| 블로그 | 포스트 | link CTA | button CTA |
|---|---|---|---|
| 영어 | SAP Cloud ALM Test Automation Practical Guide | → /why-perfectwin | → /contact-us/request-demo |
| 영어 | SAP Testing Checklist Guide | → /contact-us/request-demo | → /why-perfectwin |
| 한글 | SAP 테스트 자동화 — 자산이냐 부채냐 | → /product/erp | → /contact-us/request-demo |
| 한글 | SAP S/4HANA 배포 옵션 비교 | → /contact-us/request-demo | → /why-perfectwin |

**파일럿 설계 의도**: link vs button의 효과를 직접 비교할 수 있도록 두 포스트씩 mirror 패턴 적용 (같은 도착 페이지를 다른 utm_content로 보냄).

---

## 2️⃣ 일간 리포트 확장 — 신설 섹션 2개

기존 일간 리포트에 콘텐츠 어트리뷰션 분석을 위한 두 섹션 추가:

### 📍 1️⃣ 데모 퍼널
- **무엇**: `/contact-us/thankyou` 도달자(=실제 영업팀 메일 발생)의 어트리뷰션
- **데이터 출처**: GA4 (페이지 경로 필터)
- **표시**: 어느 캠페인·source/medium·첫 진입 페이지에서 데모 완료가 발생했는지 결정적으로 추적

### 📍 2️⃣ 캠페인별 행동 퍼널
- **무엇**: UTM 박힌 모든 세션의 캠페인별 행동(체류·페이지뷰)·데모 전환·후속 페이지
- **데이터 출처**: GA4 (sessionCampaignName ≠ "(not set)" 필터)
- **표시**: 데모 완료 안 한 트래픽도 포함. "어느 콘텐츠가 트래픽 가져왔고 어디 둘러봤는지" 광범위 분석

→ 두 섹션의 차이: 1️⃣은 데모 완료만, 2️⃣는 UTM 박힌 모든 클릭의 행동까지 포함.

---

## 3️⃣ 테스트 실행 — 8개 세션 시나리오

**실행 시각**: KST 2026-05-15 15:00~16:00
**환경**: 모바일 데이터 (내부 IP 필터링 회피)
**세션 분리**: 매번 시크릿 창 새로 열어 8개 독립 세션 발생

### 의도된 행동 패턴 (총 10개 세션)

**Part A — UTM 직접 클릭 (8 세션)**: UTM URL을 시크릿 창에서 직접 입력 → 분리 세션으로 발생

| # | 캠페인 | utm_content | 도착 | 의도된 행동 |
|---:|---|---|---|---|
| 1 | 영어 Cloud ALM | link | /why-perfectwin | 1분 머물기 → /product/erp 추가 탐색 (깊은 탐색) |
| 2 | 영어 Cloud ALM | button | /contact-us/request-demo | 폼 제출까지 (데모 완료 ①) |
| 3 | 영어 Checklist | link | /contact-us/request-demo | 폼 안 채우고 30초 이탈 |
| 4 | 영어 Checklist | button | /why-perfectwin | 30초 얕은 이탈 |
| 5 | 한글 자산/부채 | link | /product/erp | 1분 머물고 /why-perfectwin 추가 탐색 |
| 6 | 한글 자산/부채 | button | /contact-us/request-demo | 폼 제출까지 (데모 완료 ②) |
| 7 | 한글 S/4HANA | link | /contact-us/request-demo | 10초 즉시 이탈 |
| 8 | 한글 S/4HANA | button | /why-perfectwin | 2분 깊게 둘러보고 /product/erp 추가 탐색 |

**Part B — LinkedIn 경유 (2 세션)**: LinkedIn에서 블로그 링크 클릭 → 블로그 내 UTM CTA 클릭 → 데모 완료

| # | 경로 | 의도된 행동 |
|---:|---|---|
| 9 | LinkedIn → 영어 Cloud ALM 블로그 → button CTA → /contact-us/request-demo | 데모 완료 ③ |
| 10 | LinkedIn → 한글 블로그 → link CTA → /contact-us/request-demo | 데모 완료 ④ |

### 테스트 디자인 핵심
- **link vs button 효과 차이**가 자연스럽게 발생하도록 행동 패턴 분기 (1~8)
- 같은 도착 페이지(/contact-us/request-demo)에서도 link/button별 행동 차이 시뮬레이션
- **GA4 attribution 동작 검증** (9, 10): 한 세션 안에서 LinkedIn referrer + internal UTM 클릭이 동시 발생할 때 GA4가 어떻게 어트리뷰션하는지 직접 확인
- 4 캠페인 × 2 콘텐츠 타입 = 8개 행 + LinkedIn 경유 2건 → 총 10개 세션이 모든 자리에서 분리·합산 표시되는지 검증

---

## 4️⃣ 예상 결과

### 🔍 즉시 확인 (오늘 저녁~밤)
**GA4 → 보고서 → 획득 → 트래픽 획득** → 5/15 단일 일자:
- 세션 매체 `blog_cta` 행 등장 (영어+한글 합산 ~8 세션)
- 세션 캠페인 차원에서 4개 캠페인 슬러그 모두 표시

**GA4 → 보고서 → 라이프사이클 → 참여도 → 페이지 및 화면**:
- `/contact-us/thankyou` 페이지 사용자 ≥ 2명 (Session 2, 6)

### 📊 자동 리포트 도착 (내일 KST 08:43)

#### 1️⃣ 데모 퍼널 섹션
| 지표 | 예상 값 |
|---|---:|
| 데모 페이지 도달 | 6 |
| 데모 신청 완료 | 4 (Session 2, 6, 9, 10) |
| 전환율 | ~67% |

- submit.bySourceMedium: `blog/blog_cta`, `ko_blog/blog_cta`, `linkedin.com/referral` 모두 등장 가능
- submit.byCampaign: "Cloud ALM", "자산/부채" 슬러그. Session 9·10이 `(not set)`로 떨어질지 슬러그로 잡힐지는 GA4 동작에 달림
- submit.byLandingPage: `/contact-us/request-demo` (직행 button 클릭자) + 블로그 URL (Session 9·10의 첫 진입)
- submit.byFirstUserSource: LinkedIn이 별도 표기될 가능성 (Session 9·10)

#### 🔍 GA4 Attribution 동작 두 케이스 (Session 9·10 결과로 판가름)

**케이스 (a) — LinkedIn referrer 우세 (예상 우세)**: Session 9·10이 submit.bySourceMedium = `linkedin.com/referral`, submit.byCampaign = `(not set)`로 잡힘. 다만 submit.byLandingPage에 블로그 URL이 잡혀 "어느 블로그를 거쳤다"는 추론 가능.

**케이스 (b) — UTM 덮어쓰기**: Session 9·10이 깔끔하게 캠페인 슬러그로 잡혀 영어 Cloud ALM 데모 2건, 한글 데모 2건으로 합산. LinkedIn 정보는 byFirstUserSource로만 보존.

→ 결과에 따라 향후 LinkedIn 콘텐츠 어트리뷰션 전략 결정.

#### 2️⃣ 콘텐츠 퍼널 섹션
| 지표 | 예상 값 (케이스 a 기준) |
|---|---:|
| 활성 캠페인 수 | 8 (4×2) |
| 총 세션 | 8 (LinkedIn 경유 세션은 sessionCampaignName=(not set)이라 제외) |
| 데모 페이지 도달 비율 | 50% (4/8) |
| 데모 신청 완료 비율 | 25% (2/8) |

- 8개 캠페인 행이 모두 표시되고 link vs button 분리
- 각 캠페인별 페이지/세션 · 체류 · 데모 도달률 비교 가능
- Top Pages에 `/why-perfectwin`, `/product/erp`, `/contact-us/thankyou` 모두 등장
- (케이스 b면 LinkedIn 경유 세션도 포함되어 총 10 세션 + 완료율 40%)

#### 5️⃣ 종합 인사이트 섹션
- 첫 인사이트: link vs button 효과 비교 (Cloud ALM의 button이 데모 완료 만듦)
- ko_blog 캠페인의 행동 패턴 차이 분석
- **LinkedIn 경유 데모 어트리뷰션 동작 검증 결과** (a/b 어느 쪽인지)

---

## 5️⃣ 검증 후 다음 단계

| 시점 | 액션 |
|---|---|
| 내일 (5/16) 자동 리포트 수령 후 | 8개 캠페인 행 + 데모 완료 2건 정상 잡혔는지 확인 |
| 검증 OK 시 | 영어 잔여 23개 + 한글 잔여 25개 포스트 일괄 UTM 적용 |
| 적용 후 1주 | link vs button 누적 데이터로 향후 콘텐츠 CTA 전략 결정 |
| 향후 | 같은 패턴으로 LinkedIn / X 포스트도 UTM 적용 검토 |

---

## 💡 참고 — 트래킹 구조 한 줄 정리

`사용자 UTM 클릭` → GA4 (sessionSource/medium/campaign/content 자동 기록) → 매일 cron의 콜렉터가 추출 → 일간 리포트의 1️⃣ 데모 퍼널 + 2️⃣ 콘텐츠 퍼널 섹션에 자동 노출.

→ **너가 UTM 박은 모든 URL은 별도 작업 없이 다음날 리포트에 자동으로 잡힘.**

질문 있으면 ARUM에게 DM 주세요.

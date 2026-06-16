# 지표 교차 해석 규칙 v2

## 핵심 원칙

1. **단일 지표로 "좋다/나쁘다" 판단 금지** — 반드시 2개 이상 교차 확인 후 해석
2. **양(volume) 지표는 반드시 질(quality) 지표와 짝으로** — sessions ↔ engagementRate, impressions ↔ position, visits ↔ clicks
3. **같은 대상을 다른 소스로 검증** — GA4 organic ↔ GSC clicks, inblog organic ↔ GSC clicks
4. **시계열 비교 시 요일/시즌 보정 필수** — 공휴일·주말 효과를 제거한 후 비교 (섹션 10 참고)

---

## 용어 정의 (해석 기준 통일)

| 용어 | 정의 | 비고 |
|---|---|---|
| clicks (inblog) | CTA 버튼 클릭 (데모 신청, 문의 등 전환 행동) | 내부 링크 클릭과 구분할 것 |
| visits (inblog) | 해당 포스트 페이지 방문 수 | GA4 pageViews와 집계 기준 다를 수 있음 |
| CVR (inblog) | clicks ÷ visits | 분모 = visits, 분자 = CTA clicks 기준 |
| engagedSessions (GA4) | 10초 이상 체류 or 전환 이벤트 or 2페이지 이상 조회한 세션 | GA4 기본 정의 |
| position (GSC) | 검색 결과 내 평균 검사 순위 | 숫자가 낮을수록 상위 |

---

## 체크 우선순위

### Tier 1: 매주 기본 체크 (항상 적용)
- 섹션 1 — 체류시간 착시
- 섹션 2 — 트래픽 증가 착시
- 섹션 6 — GSC 검색 성과 착시
- 섹션 10 — 시계열 착시

### Tier 2: 이상 신호 감지 시 체크 (해당 지표 변동 ≥ 20% 트리거)
- 섹션 3 — 페이지 인기도 착시
- 섹션 4 — 랜딩페이지 착시
- 섹션 5 — 채널/소스 품질 착시
- 섹션 7 — inblog 블로그 착시
- 섹션 8 — 기기/국가 착시
- 섹션 9 — 크로스 소스 착시

---

## 1. 체류시간 착시 [Tier 1]

| 단일 해석 | 교차 지표 | 실제 의미 |
|---|---|---|
| avgSessionDuration 길다 → "관심 높다" | + engagementRate 낮 + pageViewsPerSession = 1 + bounceRate 높 | **방치 탭.** 켜놓기만 한 것 |
| avgSessionDuration 길다 → "관심 높다" | + engagementRate 높 + pageViewsPerSession > 1.5 | 이때만 진짜 관심 |

> **💡 추가 판별법:** desktop에서 avgSessionDuration이 유독 길고 mobile은 짧다면 방치 탭 가능성이 더 높음. 기기별 분리 확인 권장 (섹션 8과 연결)

## 2. 트래픽 증가 착시 [Tier 1]

| 단일 해석 | 교차 지표 | 실제 의미 |
|---|---|---|
| sessions 증가 → "성장 중" | + engagedSessions 변화 없음 + screenPageViewsPerSession 하락 | **허수 트래픽.** 봇이거나 바로 이탈한 방문 |
| sessions 증가 → "성장 중" | + engagedSessions 변화 없음 + screenPageViewsPerSession 유지(1~2) | **저품질 유입.** 봇은 아니지만 관심 없는 방문자 |
| sessions 증가 → "성장 중" | + newUsers만 증가, returningUsers 감소 | **유입은 되는데 재방문 0.** 콘텐츠가 기억에 남지 않음 |
| activeUsers 증가 → "사용자 늘었다" | + sessions/activeUsers 비율 하락 | 사람은 늘었지만 1번 보고 끝. 깊이가 없는 유입 |

> **💡 봇 vs 저품질 구분법:** screenPageViewsPerSession = 1 + avgSessionDuration < 1초 → 봇 가능성 높음. screenPageViewsPerSession 1~2 + avgSessionDuration 3~10초 → 사람이지만 관심 없음.

## 3. 페이지 인기도 착시 [Tier 2]

| 단일 해석 | 교차 지표 | 실제 의미 |
|---|---|---|
| pageViews 높다 → "인기 페이지" | + users 매우 낮음 (pageViews/users > 3) | **소수가 반복 조회.** 원하는 정보를 못 찾아서 왔다 갔다 하는 것일 수 있음 |
| pageViews 높다 → "인기 페이지" | + avgDuration 매우 짧 (< 5초) + bounceRate 높 | **잘못 들어온 것.** 제목 보고 클릭했는데 원하는 내용 아님 |
| 페이지 avgDuration 길다 → "몰입" | + bounceRate 높 + 해당 페이지가 랜딩페이지 | 이 페이지에서 사이트 탐색으로 이어지지 않음. 읽고 끝 |

## 4. 랜딩페이지 착시 [Tier 2]

| 단일 해석 | 교차 지표 | 실제 의미 |
|---|---|---|
| landingPage sessions 많다 → "좋은 입구" | + bounceRate 높 + pagesPerSession = 1 | **입구에서 바로 나감.** 첫인상 실패 |
| landingPage bounceRate 낮다 → "잘 잡는다" | + avgDuration 매우 짧 + pagesPerSession 낮 | 빠르게 다른 페이지 하나 갔다가 나감. 잡는 게 아니라 혼란 |
| landingPage에 / (메인) 1위 → "메인이 잘 된다" | + 다른 landingPage가 거의 없음 | **직접 URL 입력만 있다는 뜻.** 검색/소셜 유입이 특정 페이지로 안 들어온다는 신호 |

## 5. 채널/소스 품질 착시 [Tier 2]

| 단일 해석 | 교차 지표 | 실제 의미 |
|---|---|---|
| 채널 sessions 많다 → "효과적 채널" | + engagementRate 낮 + avgDuration 짧 | **양만 많고 질 나쁜 채널.** 이 채널 트래픽은 전환에 기여 안 함 |
| Organic Search sessions 증가 → "SEO 효과" | + GSC clicks 변화 없음 + (direct) 세션도 동시 증가 | **다크 소셜 가능성.** 카카오톡·슬랙 등 메신저 공유 시 리퍼러 미분류 → GA4가 Organic 또는 Direct로 오분류 |
| Organic Search sessions 증가 → "SEO 효과" | + GSC clicks 변화 없음 + (direct) 변화 없음 | **비Google 검색엔진 유입** 가능성. GSC는 Google만 집계하므로 불일치 발생 |
| Referral 많다 → "외부에서 관심" | + source/medium 확인 시 특정 도메인 1개 집중 | 다양한 관심이 아니라 **한 곳에서만 유입.** 그 소스 끊기면 트래픽 급감 |

> **💡 다크 소셜 판별법:** GA4에서 `sessionSource = (direct)` 중 `landingPage ≠ /` (메인이 아닌 특정 블로그 포스트)인 비중이 높으면 → 메신저/이메일 공유에서 온 다크 소셜일 가능성 높음. 직접 URL을 타이핑해서 블로그 포스트로 들어오는 사람은 거의 없기 때문.

## 6. GSC 검색 성과 착시 [Tier 1]

| 단일 해석 | 교차 지표 | 실제 의미 |
|---|---|---|
| impressions 높다 → "검색 노출 잘 된다" | + position > 20 | **2페이지 이후.** 사실상 아무도 안 봄. 노출 수치만 허수 |
| impressions 높 + clicks 0 → "메타 수정 필요" | + position 확인 | position < 10이면 → 맞다, 제목/메타 문제. position > 20이면 → 메타 문제가 아니라 **순위 자체가 문제** |
| avgPosition 개선 → "SEO 성과" | + impressions 감소 | **롱테일 쿼리가 빠진 것.** 노출 적은 키워드 탈락하면서 평균 순위가 "좋아 보이는" 착시 |
| avgPosition 개선 → "SEO 성과" | + impressions 유지/증가 + clicks 증가 | 이때만 진짜 SEO 개선 |
| CTR 높다 → "제목이 좋다" | + impressions 매우 적음 (< 10) | **표본 부족.** 2번 노출에 1번 클릭 = CTR 50%이지만 의미 없음 |
| 특정 query clicks 증가 → "이 키워드 효과" | + 해당 query의 page 확인 시 블로그가 아닌 홈페이지 | 블로그 SEO 효과가 아니라 **브랜드 검색**일 수 있음 |

> **💡 GSC 신뢰 기준:** impressions < 10인 query/page 데이터는 통계적으로 의미 없음. 분석 시 최소 impressions ≥ 50 필터 적용 권장.

## 7. inblog 블로그 착시 [Tier 2]

| 단일 해석 | 교차 지표 | 실제 의미 |
|---|---|---|
| post visits 높다 → "인기 포스트" | + organic = 0, source가 특정 referrer 1개 | SEO 효과 아님. **소셜이나 내부 공유에서만 유입.** 지속성 없음 |
| visits 증가 → "블로그 성장" | + clicks(CTA) 변화 없음 | **와서 읽기만 하고 행동 안 함.** CTA 배치/문구가 안 되는 것 |
| organic 높다 → "SEO 효과" | + GSC blog.perfectwin.ai clicks와 큰 차이 | inblog의 organic 분류와 GSC 실제 수치 불일치. **데이터 정합성 확인 필요** |
| visits 높 + clicks 높 → "좋은 포스트" | + CVR(clicks÷visits) 확인 | CVR 자체가 낮으면 방문만 많고 **전환 행동은 약한 것** |
| source에 "google.com" 1위 → "검색 잘 된다" | + GSC impressions/clicks 확인 | inblog source count vs GSC clicks가 크게 다르면 집계 기준 차이. 과대평가 가능 |

> **💡 CVR 해석 기준 (B2B SaaS 블로그):** CVR < 1% → CTA 개선 필요. CVR 1~3% → 정상 범위. CVR > 3% → 높은 전환, 해당 포스트의 CTA 패턴 분석해서 다른 포스트에 적용 검토.

## 8. 기기/국가 착시 [Tier 2]

| 단일 해석 | 교차 지표 | 실제 의미 |
|---|---|---|
| mobile sessions 비중 높다 → "모바일 최적화 중요" | + mobile engagementRate ≪ desktop | 모바일로 오긴 하는데 **모바일 UX가 나빠서 이탈.** 최적화가 안 된 상태 |
| 특정 국가 sessions 높다 → "해당 시장 관심" | + engagementRate 매우 낮 + avgDuration < 3초 | **봇이거나 의미 없는 트래픽.** B2B SaaS에서 타겟이 아닌 국가의 저참여 트래픽은 노이즈 |
| desktop avgDuration 길다 → "데스크톱 유저가 더 관심" | + engagementRate 교차 확인 (섹션 1 참고) | 데스크톱이 방치 탭 확률이 훨씬 높음. 단순 비교 불가 |

> **💡 국가별 봇 필터:** 타겟 국가(한국, 일본, 미국 등) 외 국가에서 engagementRate < 10%이면 해당 국가 트래픽은 분석에서 제외 권장.

## 9. 크로스 소스 착시 (GA4 × GSC × inblog) [Tier 2]

| 단일 해석 | 교차 확인 | 실제 의미 |
|---|---|---|
| GA4 Organic 증가 → "검색 유입 성장" | GSC clicks 정체 + (direct) 동시 증가 여부 확인 | **(direct) 동시 증가 시:** 다크 소셜 오분류 (섹션 5 참고). **(direct) 변화 없음:** 비Google 검색엔진 유입 가능성 |
| GSC blog page clicks 높 → "이 포스트 검색에서 인기" | inblog 해당 포스트 visits 낮 | **GSC 집계일과 inblog 집계일 차이** (GSC는 2-3일 딜레이). 같은 날 비교 시 주의 |
| 홈페이지 Referral에 blog.perfectwin.ai → "블로그가 홈페이지로 유도" | + 해당 referral sessions의 engagementRate | 유도는 되는데 engagementRate 낮으면 **블로그→홈 동선이 매끄럽지 않은 것** |

> **💡 크로스 소스 비교 시 주의:** GA4, GSC, inblog 세 소스는 집계 기준일, 세션 정의, 봇 필터링 방식이 모두 다름. ±20% 이내 차이는 정상 범위로 간주. 차이가 그 이상이면 데이터 정합성 이슈로 플래그.

## 10. 시계열 착시 [Tier 1] — 신규

| 단일 해석 | 교차 지표 | 실제 의미 |
|---|---|---|
| 이번 주 sessions 급감 → "문제 발생" | + 해당 주에 공휴일/연휴 포함 여부 확인 | **B2B SaaS는 평일 트래픽 집중.** 공휴일 1일 = 주간 트래픽 ~20% 감소 정상 |
| 주말 트래픽 급감 → "주말 콘텐츠 필요" | + 타겟 오디언스가 B2B 업무 사용자 | **정상 패턴.** B2B는 주말 트래픽이 평일의 20~30%가 일반적. 주말용 콘텐츠 투자 ROI 낮음 |
| 월초 트래픽 높고 월말 하락 → "콘텐츠 피로" | + 동일 패턴이 매월 반복되는지 확인 | **업무 사이클 효과일 수 있음.** SAP/ERP 관련은 월말 결산 시기에 오히려 바빠서 콘텐츠 소비 줄어드는 패턴 |
| 전주 대비 수치 변화 → "개선/악화" | + 동일 요일 구성인지 확인 (평일 5일 vs 4일+공휴일) | **요일 보정 없는 주간 비교는 무의미.** 평일 일평균 기준으로 비교해야 정확 |

> **💡 요일 보정 방법:** 주간 비교 시 `총 세션 ÷ 해당 주 평일 수`로 평일 일평균을 산출해서 비교. 공휴일이 낀 주는 반드시 이 방식 적용.

---

## 부록: 착시 감지 → 액션 플로우

```
지표 변동 감지 (≥ 20% 변화)
    │
    ├─ Tier 1 지표인가? → 매주 기본 교차 확인 실행
    │
    └─ Tier 2 지표인가? → 해당 섹션의 교차 규칙 적용
         │
         ├─ 교차 결과: 착시 확인됨
         │   → 실제 의미 기록
         │   → "이 지표는 X 때문에 왜곡됨" 코멘트 추가
         │   → 관련 액션 불필요 표시
         │
         └─ 교차 결과: 실제 변화 확인됨
             → 원인 분석 (어떤 페이지/채널/기기에서?)
             → 액션 아이템 도출
             → 다음 주 모니터링에 추적 항목 추가
```

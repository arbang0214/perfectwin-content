# 운영 인수인계 가이드 (ONBOARDING)

PerfecTwin **성과 모니터링 시스템**을 새 운영자가 **자신의 GitHub 계정으로 이전**해 운영하기 위한 가이드입니다.

이 시스템은 매일/매주/매월 GA4·Search Console·Bing·inblog 데이터를 수집하고, Claude로 리포트를 생성해 Slack(및 이메일)으로 발송합니다. **GitHub Actions가 전부 자동으로 돌립니다 — 별도 서버 불필요.**

---

## 0. 가장 먼저 알아야 할 것

- **코드는 거의 수정할 게 없습니다.** 같은 PerfecTwin 사이트를 계속 모니터링한다면 사이트 URL·GA4 ID는 그대로입니다.
- **진짜 작업은 "자격증명(시크릿) 이전"입니다.** 시크릿은 코드에 없고 GitHub 저장소 설정에 저장돼 있어, 저장소를 옮기면 **하나도 따라오지 않습니다.** 전부 새로 등록해야 합니다.
- 필요한 시크릿 목록·기본값은 [.env.example](.env.example)에 정리돼 있습니다.

---

## 1. 저장소 이전

GitHub Actions의 스케줄·시크릿은 **Transfer 또는 Fork로 자동 복사되지 않습니다.** 권장 순서:

1. 새 운영자 계정에 저장소를 옮긴다 (Transfer ownership) 또는 새 빈 저장소를 만들고 코드를 push.
2. 옮긴 뒤 `git remote -v`로 origin이 새 저장소를 가리키는지 확인.
3. **Actions 탭에서 워크플로가 보이는지 확인하고, 비활성화돼 있으면 "I understand... enable" 클릭해 활성화.**
   - Fork한 경우 기본적으로 Actions가 꺼져 있습니다.
4. Settings → Actions → General → **Workflow permissions** 를 **"Read and write permissions"** 로 설정.
   - 리포트가 데이터 스냅샷을 저장소에 커밋하므로 쓰기 권한이 필수입니다.

---

## 2. 시크릿 등록 (핵심 작업)

`Settings → Secrets and variables → Actions → New repository secret` 에서 아래를 **전부** 등록합니다.

### 2-1. 그대로 옮겨도 되는 값 (같은 사이트 기준)

| Secret | 값 |
|---|---|
| `GA4_PROPERTY_ID` | `494841765` |
| `GSC_SITE_URL` | `https://perfectwin.ai/,https://blog.perfectwin.ai/,https://ko.blog.perfectwin.ai/` |
| `INBLOG_BLOG_URL` | `https://blog.perfectwin.ai` |
| `INBLOG_KO_BLOG_URL` | `https://ko.blog.perfectwin.ai` |

### 2-2. 새 운영자 명의로 발급/교체해야 하는 값 ⚠️

기존 운영자 개인·조직 계정에 묶인 자격증명입니다. **반드시 새로 발급하거나, 이관 후 기존 키를 폐기(rotate)하세요.**

| Secret | 발급처 / 방법 |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys. 새 운영자 키 발급 후 등록. 모델은 `claude-sonnet-4-6` 사용 중 ([scripts/lib/claude-api.js](scripts/lib/claude-api.js)). |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 아래 **3절** 참조 (가장 까다로움) |
| `SLACK_WEBHOOK_URL` | Slack App → Incoming Webhooks. 발송할 채널의 Webhook URL. |
| `SLACK_BOT_TOKEN` | Slack App → OAuth & Permissions → Bot User OAuth Token (`xoxb-...`). 파일/문서 게시에 사용. |
| `SLACK_CHANNEL_ID` | 발송 대상 Slack 채널 ID (`C...`). 채널 우클릭 → 채널 세부정보 하단. |
| `INBLOG_API_KEY` | inblog 영문 블로그 관리자 → API 키. |
| `INBLOG_BLOG_SUBDOMAIN` | inblog 영문 블로그 서브도메인. |
| `INBLOG_KO_API_KEY` | inblog 한글 블로그 API 키. |
| `INBLOG_KO_BLOG_SUBDOMAIN` | inblog 한글 블로그 서브도메인. |
| `BING_WEBMASTER_API_KEY` | Bing Webmaster Tools → Settings → API access. (선택 — 없으면 Bing 0으로 수집) |
| `GMAIL_USER` | 이메일 발송 계정 주소. (선택) |
| `GMAIL_APP_PASSWORD` | Google 계정 → 보안 → **앱 비밀번호** (일반 비번 아님). 2단계 인증 필요. (선택) |
| `REPORT_EMAIL_TO` | 리포트 수신 이메일 (쉼표로 여러 명 가능). (선택) |

> ⚠️ **이메일·Slack은 기존 운영자 개인 계정에 종속되기 쉽습니다.** 기존 운영자가 떠나면 발송이 끊기므로, 새 운영자/팀 공용 계정으로 반드시 교체하세요.

---

## 3. Google 서비스 계정 (GA4 + Search Console)

이 키 파일(`config/perfectwin-monitoring-*.json`)은 **`.gitignore` 처리되어 저장소에 없습니다.** 두 가지 방법:

### 방법 A — 기존 키를 그대로 사용 (가장 쉬움)

1. 기존 운영자에게 서비스 계정 JSON 파일을 받는다.
2. 파일 **내용 전체**를 `GOOGLE_SERVICE_ACCOUNT_JSON` 시크릿에 붙여넣는다.
3. 코드 수정 불필요 (파일명 `perfectwin-monitoring-b8809c36eda2.json` 그대로 사용).

### 방법 B — 새 서비스 계정 발급 (권장, 더 깔끔)

1. Google Cloud Console → IAM → 서비스 계정 생성 → JSON 키 발급.
2. **GA4**: Google Analytics → 관리 → 속성 액세스 관리 → 서비스 계정 이메일을 **뷰어**로 추가.
3. **Search Console**: 각 속성(perfectwin.ai / blog / ko.blog)에 서비스 계정 이메일을 **사용자로 추가**.
   - GSC는 가능하면 **도메인 속성(sc-domain)** 으로 등록돼 있어야 함 — 코드가 sc-domain 우선 매칭 후 host 필터로 서브도메인을 분리함 ([monitoring/collectors/gsc.js](monitoring/collectors/gsc.js)).
4. 새 JSON 내용을 `GOOGLE_SERVICE_ACCOUNT_JSON` 시크릿에 등록.
5. 파일명을 바꿨다면 아래 5곳의 하드코딩된 파일명도 교체:
   - [monitoring/utils/google-auth.js](monitoring/utils/google-auth.js) (기본 경로)
   - 워크플로 4개: daily / weekly / monthly / (post-doc는 미사용) 의 "Google 서비스 계정 키 생성" 스텝
   - **파일명을 그대로 두면 이 수정은 불필요.**

---

## 4. 동작 확인 (Smoke Test)

시크릿 등록이 끝나면 스케줄을 기다리지 말고 수동으로 검증하세요.

1. **Actions 탭 → "일간 성과 리포트" → Run workflow** (workflow_dispatch).
2. 로그에서 `[1/8] GA4` ~ `[8/8] Slack 발송`까지 통과하는지 확인.
3. Slack 채널에 리포트가 도착하는지 확인.
4. 실패 시 로그의 어느 수집 단계(GA4/GSC/Bing/inblog)에서 멈췄는지 보면 어떤 시크릿이 문제인지 바로 드러남.

> 참고: 일부 시크릿이 부분 매칭으로 로그에 마스킹되어 디버깅이 어려울 수 있습니다. 값 자체가 로그에 안 찍히면 마스킹 때문일 수 있으니, 실패 단계로 역추적하세요.

---

## 5. 자동 스케줄 (등록된 워크플로)

모든 cron은 정시(0/15/30/45분)를 피해 GitHub Actions 큐 지연을 우회하도록 `:43` 등으로 설정돼 있습니다. 임의로 정시로 바꾸지 마세요.

| 워크플로 | 스케줄 | 비고 |
|---|---|---|
| [일간 리포트](.github/workflows/daily-report.yml) | 매일 08:43 KST (+ 11:17 KST 백업) | `--skip-if-exists`로 백업은 1차 실패 시에만 발송 |
| [주간 리포트](.github/workflows/weekly-report.yml) | 매주 금 08:43 KST | |
| [월간 리포트](.github/workflows/monthly-report.yml) | 매월 말일 08:43 KST | 스크립트가 KST 기준 실제 월말인지 확인 |
| [LinkedIn 리포트](.github/workflows/linkedin-report.yml) | 수동 | |
| [문서 Slack 게시](.github/workflows/post-doc.yml) | 수동 | 지정 마크다운을 Slack에 게시 |

리포트 결과 스냅샷은 `data/monitoring/`에, 대시보드 데이터는 `dashboard/data.json`에 자동 커밋됩니다.

---

## 6. 대시보드 (선택)

`dashboard/` 는 정적 페이지로 `dashboard/data.json`을 읽어 시각화합니다. 로컬에서 보려면:

```bash
npm install
npm run server   # express 서버 (server.js)
```

GitHub Pages 등으로 호스팅하려면 별도 설정이 필요합니다 (현재 자동화 안 됨).

---

## 7. 인수인계 체크리스트

- [ ] 저장소를 새 계정으로 이전하고 Actions 활성화
- [ ] Workflow permissions = Read and write 설정
- [ ] `.env.example`의 모든 시크릿을 GitHub Secrets에 등록
- [ ] ⚠️ 개인 종속 키(Anthropic / Slack / inblog / Bing / Gmail) 새 명의로 교체
- [ ] Google 서비스 계정 JSON 확보 + GA4·GSC 권한 부여
- [ ] "일간 리포트" 수동 실행으로 Slack 발송까지 검증
- [ ] (기존 운영자) 이관 완료 후 옛 API 키 폐기(rotate)

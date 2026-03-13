# UTM Convention

## URL Format

```
https://perfectwin.io/blog/{slug}?utm_source={source}&utm_medium={medium}&utm_campaign={campaign}
```

## Parameters

### utm_source (소스)

| 값 | 채널 |
|---|---|
| `linkedin-company` | LinkedIn 회사 페이지 포스트 |
| `linkedin-personal` | LinkedIn ARUM 개인 포스트 |
| `x-twitter` | X(Twitter) 포스트/스레드 |
| `blog-ko` | 한글 블로그 내 내부 링크 |
| `blog-en` | 영문 블로그 내 내부 링크 |
| `email-sig` | 이메일 서명 링크 |

### utm_medium (미디엄)

| 값 | 설명 |
|---|---|
| `social` | 소셜 미디어 (LinkedIn, X) |
| `blog` | 블로그 내부 링크 |
| `email` | 이메일 |

### utm_campaign (캠페인)

주제 슬러그 형식 — 블로그 URL 슬러그와 동일하게 사용.

- 형식: `kebab-case`
- 예시: `s4hana-migration-testing-failures`, `sap-test-data-management-guide`

## Example URLs

```
# LinkedIn 회사 포스트 → 블로그
https://perfectwin.io/blog/s4hana-migration-testing-failures?utm_source=linkedin-company&utm_medium=social&utm_campaign=s4hana-migration-testing-failures

# X 스레드 → 블로그
https://perfectwin.io/blog/s4hana-migration-testing-failures?utm_source=x-twitter&utm_medium=social&utm_campaign=s4hana-migration-testing-failures

# 한글 블로그 → 영문 블로그 상호 링크
https://perfectwin.io/blog/s4hana-migration-testing-failures?utm_source=blog-ko&utm_medium=blog&utm_campaign=s4hana-migration-testing-failures
```

## Rules

- 모든 외부 링크에 UTM 필수 적용
- campaign 값은 해당 주의 블로그 슬러그와 통일
- n8n 워크플로에서 자동 생성하도록 구현
- utm_content, utm_term은 현재 미사용 (추후 A/B 테스트 시 도입)
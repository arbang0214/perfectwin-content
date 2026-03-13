# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PerfecTwin 콘텐츠 자동화 파이프라인. SAP 테스트 자동화 도구 "PerfecTwin"의 마케팅 콘텐츠를 자동 생성·배포하는 시스템.

**핵심 워크플로:** 매주 블로그 1개 생성 → LinkedIn 회사/개인 포스트 + X(Twitter) 포스트로 자동 파생

## Tech Stack

- **Claude API** — 블로그 원문 및 파생 콘텐츠 생성 (LLM)
- **n8n** — 워크플로 오케스트레이션 (스케줄링, API 연결)
- **Framer CMS API** — 블로그 발행
- **Buffer API** — LinkedIn/X 소셜 포스트 스케줄링·발행
- **Ideogram API** — 블로그/소셜용 이미지 생성

## Content Pipeline Flow

```
[주간 트리거 (n8n cron)]
  → Claude API: 블로그 초안 생성
  → Ideogram API: 대표 이미지 생성
  → Framer CMS API: 블로그 발행
  → Claude API: 블로그 → LinkedIn 회사 포스트 파생
  → Claude API: 블로그 → LinkedIn 개인 포스트 파생
  → Claude API: 블로그 → X 포스트 파생
  → Buffer API: 소셜 포스트 스케줄링
```

## Key Conventions

- 프롬프트 템플릿은 `prompts/` 디렉토리에 Markdown으로 관리
- n8n 워크플로 JSON은 `workflows/` 디렉토리에 export/버전관리
- API 키·시크릿은 `.env` 파일 사용 (절대 커밋 금지)
- 콘텐츠 출력 언어: 영문 (PerfecTwin 글로벌 마케팅 대상)

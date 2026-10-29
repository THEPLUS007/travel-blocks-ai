# 보안 업데이트 호환성 검증

검증일: 2026-10-29. 기준: PR #1의 `70babad`. 별도 worktree `/tmp/travel-ai-security-compat`, branch `compat/security-dependency-upgrades`에서 검증했습니다. 원래 Draft PR 브랜치·설치 및 운영 서버는 변경하지 않았습니다.

## 결론

**호환 범위 패치는 그대로 통과하며, Zod 4는 최소 코드 보완을 동반하면 통과합니다. 단순 버전 교체는 호환되지 않습니다.**

| 조합 | 실제 결과 |
|---|---|
| 원래 의존성 | production audit 5건: low 1 / moderate 1 / high 3 |
| 호환 범위 내 패치, Zod 3 유지 | 전체 verify·eval PASS. production audit는 Zod high 1건 남음 |
| Zod 4.6.7 단순 교체 | FAIL: `zod-to-json-schema`의 Zod 3 타입과 충돌, `ZodTypeDef` 제거 및 generic signature 변경 |
| Zod 4.6.7 + 최소 보완 | clean npm ci, verify, eval, Chromium E2E PASS. production audit 0건 |

확인 버전:

- `apps/web/node_modules/vite`: **6.4.5**
- `node_modules/fast-json-stringify/node_modules/fast-uri`: **4.2.3**
- `node_modules/fast-uri`: **3.1.9**
- `node_modules/fastify`: **5.12.7**
- `node_modules/source-map-js`: **1.2.2**
- `node_modules/vite`: **7.3.7**
- `node_modules/zod`: **4.6.7**

## 필요한 보완

1. shared/AI/decision 관련 6개 workspace의 Zod 버전을 통일했습니다.
2. `zod-to-json-schema`를 제거하고 Zod 4 내장 `z.toJSONSchema`를 사용했습니다. `draft-7`, input mode, inline reuse를 지정하고 순환 스키마는 오류로 처리합니다.
3. input mode에서 사라지는 object의 `additionalProperties: false`를 복원했습니다. 기존 Gemini 요청의 알 수 없는 필드 제한을 유지하며 default 배열을 임의로 required로 바꾸지 않습니다.
4. AI 및 self-hosted provider의 `ZodTypeDef`/ZodType generic을 새 API에 맞췄습니다. 예외 처리·모델 라우팅·retry·auth/ownership 정책을 변경하지 않았습니다.
5. 기존 Zod 3에서 생성한 Gemini 스키마 3개를 고정 fixture로 보존했습니다. 전환 후 전체 schema 비교가 통과합니다. 유일한 허용 차이는 dayNumber의 `Number.MAX_SAFE_INTEGER` 상한이며 native Zod 4의 정수 검증에 맞춥니다.
6. 과대 bounded array가 각 element를 검사하기 전에 거부되는 회귀 검사를 추가했습니다. 실제 큰 메모리를 소모하는 공격은 실행하지 않았습니다.

## 재현 결과

- Node 22.23.2, npm 10.9.8, Linux ARM64.
- 새 lock으로 `npm ci`를 다시 수행한 뒤 최종 검증.
- `npm run verify`: PASS — Vitest **328개**, MCP suite, lint, TypeScript, API/Web 빌드.
- AI tests: **98개**, 그중 전환 비교/조기 차단 회귀 2개 추가.
- `npm run eval`: **8/8 시나리오, 98/98 검사** PASS.
- Chromium E2E: PASS — 생성·추천·저장·재열기·연결·새로고침·후보 검토. fake-provider API/preview를 별도 localhost 33001/5174에서 실행.
- `npm audit --omit=dev`: **found 0 vulnerabilities**.
- `git diff --check`: PASS.
- 원래 PR branch는 clean으로 유지했고 운영 health는 `ok`입니다. 배포·재시작·remote push·DB migration·live provider 호출 없음.

## 제한 및 트레이드오프

- 브라우저 JS gzip: 91.44 → **105.76 kB** (약 +14.32 kB). uncompressed JS는 320.58 → 360.12 kB입니다. 호환성 통과를 번들 크기 개선이라고 주장하지 않습니다.
- Zod upstream의 PURE annotation 위치에 관한 Rollup 경고가 있으나 빌드는 성공합니다. 경고를 숨기는 설정은 추가하지 않았습니다.
- 실제 Gemini/Places 호출, PostgreSQL integration/backup restore와 원격 CI는 이 버전 조합에서 아직 실행하지 않았습니다. 이를 기존 PR의 이전 버전 통과 결과로 대체하지 않습니다.
- production audit 0은 개발 도구까지 포함한 전체 감사 0을 뜻하지 않습니다. 전체 감사 결과는 아래와 같습니다. 자동 force update나 보안 검사 비활성화는 하지 않았습니다.

```json
{
  "vulnerabilities": {
    "info": 0,
    "low": 0,
    "moderate": 5,
    "high": 0,
    "critical": 2,
    "total": 7
  },
  "packages": {
    "@esbuild-kit/core-utils": "moderate",
    "@esbuild-kit/esm-loader": "moderate",
    "@vitest/mocker": "moderate",
    "drizzle-kit": "moderate",
    "esbuild": "moderate",
    "tinypool": "critical",
    "vitest": "critical"
  }
}
```

기존 보안 정책대로 production audit 기준을 유지합니다. 개발 도구 체인의 남은 항목은 별도 major migration과 검증이 필요합니다.

## 적용 상태

이 결과는 검증 후보입니다. 원래 PR #1에는 아직 반영하지 않았으므로 기존 Quality 실패 상태를 이 문서만으로 해결했다고 주장하지 않습니다. 운영 적용 시에는 이 검증 브랜치의 의존성·변환기·회귀 fixture를 함께 반영하고 해당 commit의 원격 Quality/E2E/PostgreSQL 결과를 확인해야 합니다.

참고: [Zod 4 migration](https://zod.dev/v4/changelog), [native JSON Schema conversion](https://zod.dev/json-schema), [Zod 보안 공지](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

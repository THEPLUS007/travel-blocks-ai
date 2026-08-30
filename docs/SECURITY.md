# Security

- 익명 session ID는 서버에서 생성한 256-bit 난수이며 httpOnly, sameSite=lax cookie로 전달합니다.
- DB에는 cookie 원문이 아닌 SHA-256 해시만 저장하고 모든 Trip query에 owner ID 조건을 적용합니다.
- cookie는 서명되지 않지만 임의 값은 새로운 익명 사용자만 생성합니다. 기존 세션 추측에는 256-bit 값이 필요해 현재 구조는 `SESSION_SECRET`을 사용하지 않습니다.
- `COOKIE_SECURE`는 명시적으로 설정합니다. 현재 HTTP code-server proxy는 `false`, HTTPS는 `true`입니다.
- `TRUST_PROXY`는 신뢰할 수 있는 reverse proxy가 있을 때만 활성화합니다.
- `.env`, `.env.*`는 무시하고 `.env.example`만 추적합니다. 실제 `.env` 권한은 600입니다.
- Drizzle parameter binding, Zod 입력/DB JSON 검증, body limit, rate limit, timeout, Helmet을 적용합니다.
- DB URI, provider key, cookie, 원문 provider response는 응답 또는 로그에 기록하지 않습니다.
- production DB 실패 시 Memory fallback은 없습니다.

## Dependency audit baseline

`npm audit --omit=dev`는 production dependency 기준으로 High/Moderate 0건이어야 합니다.

현재 전체 audit에 남은 Moderate 4건은 API package의 개발 전용 migration 도구 체인입니다.

| Package | Path | Exposure | Resolution |
| --- | --- | --- | --- |
| `drizzle-kit@0.31.10` | direct devDependency | migration/schema tooling only | non-breaking upstream fix를 기다립니다. |
| `@esbuild-kit/esm-loader@2.6.5` | `drizzle-kit` transitive | development loader only | `drizzle-kit` 업데이트 시 제거 여부를 재검토합니다. |
| `@esbuild-kit/core-utils@3.3.2` | loader transitive | development utility only | 상위 dependency 업데이트로 해결합니다. |
| `esbuild@0.18.20` | core-utils transitive | vulnerable development server는 production에서 사용하지 않음 | GHSA-67mh-4wv8-2f99의 non-breaking 상위 fix를 기다립니다. |

`npm audit`이 제안하는 `drizzle-kit@0.18.1` 전환은 현재 버전보다 오래된 breaking downgrade이므로 적용하지 않습니다. 이 체인은 production install audit에는 포함되지 않으며 web/API production runtime이나 bundle에 포함되지 않습니다. Drizzle toolchain을 업데이트할 때 전체 audit을 다시 확인합니다.

`GOOGLE_PLACES_API_KEY`는 API server 환경에서만 읽으며 frontend 환경변수, browser bundle, API response 또는 application log에 포함하지 않습니다. Google Places 응답은 Zod로 검증한 최소 application shape로만 변환합니다.

# 실사용 전 체크리스트

이 문서는 정육 썸네일 생성기를 실제 Supabase/OpenAI 환경에 연결하기 전에 확인해야 할 항목을 정리합니다. 로컬 개발 환경과 배포 환경 모두에서 사용할 수 있습니다.

체크박스는 순서대로 진행하면서 하나씩 표시하세요. 각 단계는 앞 단계가 끝나야 진행할 수 있습니다.

## 비용 안내 (먼저 읽으세요)

- 이 체크리스트의 대부분 단계는 **OpenAI 비용이 발생하지 않습니다.**
- 아래 두 단계만 예외입니다.
  - **"저장된 키 테스트" (`/api/openai-api-key/test`)**: OpenAI `models` 목록 조회 API만 호출합니다. 과금 대상 엔드포인트가 아니므로 **비용이 거의 없거나 없습니다.**
  - **"일반판매용 1장 생성", "선물세트용 2~4장 생성" (`/api/generate-thumbnails`)**: OpenAI Images API(`gpt-image-1`)를 실제로 호출합니다. **호출 1회당 OpenAI 이미지 생성 비용이 발생할 수 있습니다.** 테스트 계정의 OpenAI 사용량/청구 대시보드를 확인하면서 진행하세요.
- 아래 체크리스트에서 비용이 발생 가능한 단계에는 `💰`로 표시했습니다.

## A. Supabase 준비

- [ ] Supabase 프로젝트를 생성했다.
- [ ] Authentication > Providers에서 Email/Password Auth를 활성화했다.
- [ ] Authentication > Users에서 테스트로 로그인할 사용자 계정을 미리 생성했다. (공개 회원가입 화면은 제공하지 않는다.)
- [ ] Supabase SQL Editor에서 `docs/generation-jobs.sql`을 실행했다. (`generation_jobs` 테이블 생성)
- [ ] Supabase SQL Editor에서 `docs/user-openai-api-keys.sql`을 실행했다. (`user_openai_api_keys` 테이블 생성)

두 SQL을 실행하지 않으면 관련 API 응답에 `...테이블이 준비되지 않았습니다. docs/....sql을 Supabase에서 실행했는지 확인해 주세요.` 형태의 에러가 표시됩니다. `GET /api/health` 응답의 `tables` 필드로도 두 테이블이 준비됐는지 바로 확인할 수 있습니다 (아래 "진단 API" 절 참고).

## B. 로컬 환경변수 설정

- [ ] `.env.local` 파일을 만들고 아래 환경변수를 모두 입력했다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
API_KEY_HASH_SECRET=긴_랜덤_문자열
OPENAI_API_KEY_ENCRYPTION_SECRET=긴_랜덤_문자열
```

각 환경변수의 의미:

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase 프로젝트 URL. 클라이언트와 서버 모두에서 사용하는 공개 값입니다.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase 프로젝트의 anon(공개) API 키. Supabase Auth 세션 처리에 사용합니다.
- `DATABASE_URL`: 생성 이력(`generation_jobs`)과 API 키 설정(`user_openai_api_keys`) 테이블을 읽고 쓰는 Postgres 접속 문자열입니다. 서버에서만 사용합니다.
- `API_KEY_HASH_SECRET`: 이전 구조 호환용 `client_key_hash`를 HMAC-SHA256으로 생성할 때 쓰는 서버 전용 secret입니다.
- `OPENAI_API_KEY_ENCRYPTION_SECRET`: 사용자가 저장한 OpenAI API 키를 AES-256-GCM으로 암호화/복호화할 때 쓰는 서버 전용 secret입니다.

5개 환경변수 중 하나라도 없으면 관련 서버 API 응답에 `서버 환경변수 {이름}이 설정되지 않았습니다.` 형태의 에러가 표시됩니다. 이 에러 메시지에는 환경변수 이름만 포함되며 실제 값은 포함되지 않습니다.

## C. 로컬 실사용 검증 순서

- [ ] 1. `npm install`
- [ ] 2. `npm run dev`
- [ ] 3. `GET http://localhost:3000/api/health`로 `requiredEnv`, `authEnv`, `database`, `tables`가 모두 `ok`인지 먼저 확인한다. (아래 "진단 API" 절 참고, OpenAI 비용 없음)
- [ ] 4. 브라우저에서 `/login` 접속
- [ ] 5. Supabase 테스트 계정(이메일/비밀번호)으로 로그인 시도
- [ ] 6. 로그인 성공 후 `/`로 이동해 썸네일 생성기 화면이 보이는지 확인 (로그인 성공 확인)
- [ ] 7. API 키 설정 탭으로 이동
- [ ] 8. OpenAI API 키 저장
- [ ] 9. 저장된 키 테스트 💰(거의 없음/없음)
- [ ] 10. 이미지 생성 탭으로 이동
- [ ] 11. 원본 이미지 1장 업로드
- [ ] 12. 일반판매용 모드로 1장 생성 💰
- [ ] 13. 생성된 이미지를 JPEG로 다운로드해 확인
- [ ] 14. 원본 이미지 2장 업로드
- [ ] 15. 선물세트용 모드로 2~4장 생성 💰
- [ ] 16. 생성된 이미지를 ZIP으로 다운로드해 확인
- [ ] 17. 생성 이력 탭에서 방금 생성한 작업들이 표시되는지 확인
- [ ] 18. 로그아웃 버튼으로 로그아웃 성공 확인
- [ ] 19. 로그아웃 상태에서 `/`에 접근하면 `/login`으로 리다이렉트되는지 확인 (비로그인 접근 차단 확인)

## D. Supabase DB 확인

Supabase SQL Editor에서 아래 쿼리로 직접 확인합니다. **API 키 원문을 조회하거나 출력하는 쿼리는 실행하지 마세요.**

```sql
-- generation_jobs: user_id가 채워지고, 메타데이터만 저장되는지 확인
select
  id,
  user_id,
  status,
  requested_count,
  mode,
  background_prompt,
  created_at,
  completed_at,
  error_message,
  duration_ms
from generation_jobs
order by created_at desc
limit 20;
```

- [ ] `user_id` 컬럼에 로그인한 Supabase 사용자 UUID가 채워져 있다.
- [ ] `status`, `requested_count`, `mode`, `background_prompt`가 요청한 값과 일치한다.
- [ ] 이미지 파일, base64 문자열, URL 등 이미지 데이터로 보이는 값이 어떤 컬럼에도 없다.

```sql
-- user_openai_api_keys: last4만 노출되고 평문 API 키가 없는지 확인 (encrypted_api_key 값 자체는 출력하되 내용을 읽지 않는다)
select
  user_id,
  api_key_last4,
  length(encrypted_api_key) as encrypted_api_key_length,
  created_at,
  updated_at
from user_openai_api_keys;
```

- [ ] `api_key_last4`에는 4자리 문자열만 있다. (`sk-...` 형태의 전체 키가 아니다.)
- [ ] `encrypted_api_key_length`만 확인했고, `encrypted_api_key` 컬럼 값 자체를 화면에 출력하거나 복사하지 않았다.
- [ ] 만약 `encrypted_api_key` 값을 눈으로 직접 확인해야 한다면, 값이 `sk-`로 시작하는 평문 키 형태가 **아니라** `v1:영문숫자:영문숫자:영문숫자` 형태의 암호문인지만 확인하고 즉시 닫는다.

## E. 보안 확인

- [ ] 브라우저 개발자 도구 Network 탭에서 `/api/generate-thumbnails` 요청 body에 OpenAI API 키가 포함되지 않는다.
- [ ] `/api/generate-thumbnails`, `/api/openai-api-key`, `/api/openai-api-key/test` 응답 JSON에 OpenAI API 키 원문이 포함되지 않는다.
- [ ] Supabase DB의 어떤 테이블에도 OpenAI API 키 평문이 없다. (D 항목과 동일한 내용을 보안 관점에서 재확인)
- [ ] 브라우저 Application 탭에서 localStorage, sessionStorage, cookie에 OpenAI API 키 값이 저장되어 있지 않다.
- [ ] `GET /api/health` 응답에 `DATABASE_URL`, `API_KEY_HASH_SECRET`, `OPENAI_API_KEY_ENCRYPTION_SECRET`, Supabase key, OpenAI API 키 등 어떤 secret 값도 포함되어 있지 않다. (환경변수 이름과 ok/missing 상태만 있어야 한다.)

## F. 배포 전 확인

- [ ] Vercel(또는 사용하는 배포 환경)의 환경변수 설정에 B 항목의 5개 환경변수를 모두 등록했다.
- [ ] Supabase Authentication > URL Configuration에서 배포 도메인이 Redirect URL에 등록되어 있다.
- [ ] 배포된 `/robots.txt`가 검색엔진 수집을 전체 차단한다.
- [ ] 배포된 `GET /api/health`가 `requiredEnv`, `authEnv`, `database`, `tables` 모두 `ok`를 반환한다.
- [ ] 이미지 생성 요청이 배포 환경의 함수 실행 시간 제한(timeout) 안에 끝난다.
- [ ] 4장 생성 요청이 배포 환경에서도 실패 없이 완료된다. (타임아웃, 메모리 제한 등)

## 진단 API: `GET /api/health`

로그인이나 이미지 생성 없이도 서버 설정 상태를 빠르게 확인할 수 있는 진단 API입니다. **OpenAI를 호출하지 않으며, DB 조회는 `select 1`과 테이블 존재 확인 정도의 가벼운 쿼리만 실행합니다.**

응답 예시:

```json
{
  "app": "ok",
  "database": "ok",
  "requiredEnv": "ok",
  "authEnv": "ok",
  "missingEnvVars": [],
  "tables": {
    "generation_jobs": "ok",
    "user_openai_api_keys": "ok"
  }
}
```

필드 설명:

- `app`: 서버 프로세스가 요청을 처리할 수 있는지. 항상 `ok`.
- `database`: `DATABASE_URL`로 Postgres에 접속해 `select 1`을 실행할 수 있는지. `ok` 또는 `error`.
- `requiredEnv`: `DATABASE_URL`, `API_KEY_HASH_SECRET`, `OPENAI_API_KEY_ENCRYPTION_SECRET`이 모두 설정됐는지. `ok` 또는 `missing`.
- `authEnv`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`가 모두 설정됐는지. `ok` 또는 `missing`.
- `missingEnvVars`: 누락된 환경변수 **이름** 목록. 값은 절대 포함하지 않는다.
- `tables`: `generation_jobs`, `user_openai_api_keys` 테이블이 실제로 존재하는지. `ok`, `missing`, 또는 DB 접속 자체가 안 돼 확인할 수 없는 경우 `unknown`.

이 API는 다음 값을 **절대 반환하지 않습니다.**

- `DATABASE_URL`, `API_KEY_HASH_SECRET`, `OPENAI_API_KEY_ENCRYPTION_SECRET`의 실제 값
- Supabase URL/anon key의 실제 값
- OpenAI API 키(저장된 키, 암호화된 키 모두)
- 로그인 사용자 정보, 생성 이력, 그 외 사용자 데이터

모든 항목이 `ok`가 아니어도 이 API 자체는 200이 아닌 503으로 응답할 뿐 절대 예외를 던지거나 서버 로그에 secret을 남기지 않습니다.

## 실제 OpenAI 호출 전까지 확인 가능한 것 / 확인 불가능한 것

- `GET /api/health`, 로그인, API 키 저장/삭제, 저장된 키 형식 검증, 생성 이력 조회, 로그아웃/접근 차단은 **OpenAI 호출 없이** 이 문서의 절차만으로 확인할 수 있습니다.
- **실제로 유효한 이미지가 생성되는지, 프롬프트 품질이 기대한 결과를 내는지, 4장 동시 생성이 타임아웃 없이 끝나는지**는 유효한 고객사 OpenAI API 키로 C 항목의 12·15번 단계(💰 표시)를 직접 실행해야만 확인할 수 있습니다. 이 저장소의 `lint`/`typecheck`/`build` 검증만으로는 확인할 수 없습니다.

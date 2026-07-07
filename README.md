# 정육 썸네일 생성기

정육 쇼핑몰 운영자가 로그인 후 원본 정육 사진을 업로드하고, 고객사 본인의 OpenAI API 키로 쇼핑몰 대표 썸네일을 생성하는 Next.js 앱입니다.

## 서비스 목적

- 원본 정육 이미지 기반으로 1080x1080 JPEG 썸네일을 생성합니다.
- 일반판매용 또는 선물세트용 분위기를 선택할 수 있습니다.
- 텍스트, 로고, 가격, 배지, 라벨이 없는 상품 중심 썸네일을 생성합니다.
- 실제 상품의 양, 부위, 형태, 색감, 마블링을 과장하지 않는 프롬프트를 사용합니다.

## API 키 처리 정책

- 이미지 생성은 API 키 설정 탭에 저장된 OpenAI API 키를 사용합니다. 이미지 생성 탭에서는 API 키를 직접 입력하지 않습니다.
- 사용자는 API 키 설정 탭에서 최초 1회 OpenAI API 키를 저장해야 이미지 생성을 사용할 수 있습니다.
- 저장된 API 키는 서버에서 AES-256-GCM으로 암호화되어 DB에 저장되며, API 키 원문은 DB에 평문으로 저장하지 않습니다.
- 저장된 API 키 원문은 다시 표시되지 않으며, 화면에는 마지막 4자리(last4)만 노출됩니다.
- `/api/generate-thumbnails`는 로그인한 사용자의 저장된 API 키를 서버에서 조회하고 복호화해 OpenAI Images API 호출에 사용합니다. request body에는 API 키를 포함하지 않습니다.
- 저장된 API 키를 삭제하면 이후 이미지 생성이 불가능하며, 이미지 생성 탭에 안내 문구와 생성 버튼 비활성화로 표시됩니다.
- API 키는 URL query string에 넣지 않습니다.
- API 키는 클라이언트 코드에 하드코딩하지 않습니다.
- API 키 원문은 서버 로그와 서버 응답에 포함하지 않습니다.
- 서버 DB에는 OpenAI API 키 원문을 저장하지 않으며, 이전 구조 호환을 위해 HMAC-SHA256으로 처리한 `client_key_hash`만 보조 필드로 저장할 수 있습니다.
- 원본 이미지와 생성 결과 이미지는 서버에 저장하지 않습니다.

고객사는 OpenAI API 키를 처음 한 번 발급해 API 키 설정 탭에 저장한 뒤 계속 재사용하면 됩니다. 작업할 때마다 새 API 키를 만들 필요는 없습니다.

- 이 도구는 원본 이미지와 생성 결과 이미지를 저장하지 않습니다.
- 생성 이력에는 메타데이터(생성 일시, 개수, 모드, 배경 설명, 완료 여부, 실패 사유, 소요 시간)만 저장됩니다.
- OpenAI API 키는 암호화되어 저장되며, 저장 후에는 원문으로 다시 표시되지 않습니다.

## 설치 방법

```bash
npm install
```

## 실행 방법

```bash
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## 배포 방법

Vercel 또는 Node.js 런타임을 지원하는 환경에 배포할 수 있습니다.

```bash
npm run build
npm run start
```

이미지 후처리에 `sharp`를 사용하므로 배포 환경은 Node.js 런타임을 지원해야 합니다.

## 환경변수 설정 방법

이 앱은 서버 고정 OpenAI API 키를 사용하지 않습니다.

고객사는 API 키 설정 탭에서 본인의 OpenAI API 키를 암호화해 저장하고, 이미지 생성 API Route는 로그인한 사용자의 저장된 키를 복호화해 해당 요청 처리 중에만 사용합니다.

생성 이력과 사용자별 API 키 설정을 저장하려면 Supabase Auth 설정, Postgres 접속 정보, API 키 hash용 HMAC secret, API 키 암호화 secret이 필요합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
API_KEY_HASH_SECRET=긴_랜덤_문자열
OPENAI_API_KEY_ENCRYPTION_SECRET=긴_랜덤_문자열
```

`API_KEY_HASH_SECRET`은 이전 구조 호환용 `client_key_hash` 생성에 사용합니다. 생성 이력 조회 기준은 로그인한 Supabase 사용자 ID입니다.

`OPENAI_API_KEY_ENCRYPTION_SECRET`은 API 키 설정 탭에서 저장하는 OpenAI API 키를 AES-256-GCM으로 암호화하고 복호화할 때 서버에서만 사용합니다. 이 값은 클라이언트에 노출하지 않습니다.

`DATABASE_URL`, `API_KEY_HASH_SECRET`, `OPENAI_API_KEY_ENCRYPTION_SECRET` 중 하나라도 설정되지 않으면, 해당 값을 사용하는 서버 API Route는 `서버 환경변수 {환경변수 이름}이 설정되지 않았습니다.` 형태의 에러를 반환합니다. 이 에러에는 환경변수 이름만 포함되며 실제 값은 절대 포함하지 않습니다. (`src/lib/server/env.ts` 참고)

## Supabase Auth 설정

1. Supabase 프로젝트를 생성합니다.
2. Authentication > Providers에서 Email provider를 활성화합니다.
3. 공개 회원가입 화면은 제공하지 않습니다.
4. Supabase Dashboard의 Authentication > Users에서 사용할 이메일/비밀번호 계정을 미리 생성합니다.
5. 앱의 `/login`에서 해당 계정으로 로그인합니다.

로그인한 사용자만 썸네일 생성기, 생성 이력 탭, API 키 설정 탭을 사용할 수 있습니다. 생성 이력과 저장된 API 키는 로그인한 Supabase 사용자 ID 기준으로 저장하고 조회합니다.

## API 키 설정 탭

- 로그인 사용자는 API 키 설정 탭에서 OpenAI API 키를 저장, 삭제, 테스트할 수 있습니다.
- 저장 시 API 키 원문은 DB에 저장하지 않고, 서버에서 AES-256-GCM으로 암호화한 값과 마지막 4자리만 저장합니다.
- 저장된 API 키 원문은 다시 볼 수 없습니다.
- API 키를 교체하려면 새 키를 입력해 다시 저장하면 됩니다.
- 저장된 API 키를 삭제하면 해당 로그인 사용자 row만 삭제합니다.
- 저장된 API 키는 이미지 생성 탭의 썸네일 생성 요청에 사용됩니다.
- 이미지 생성 탭에서는 API 키를 직접 입력하지 않으며, 저장된 키 상태(있음/없음)만 표시됩니다.
- 저장된 API 키가 없으면 이미지 생성 탭의 업로드, 옵션, 생성 버튼이 비활성화되고 API 키 설정 탭으로 이동하는 버튼이 표시됩니다.
- 저장된 API 키를 삭제하면 이후 이미지 생성이 불가능합니다.

## DB 설정 방법

Supabase Postgres에서 아래 SQL을 실행합니다.

```bash
docs/generation-jobs.sql
docs/user-openai-api-keys.sql
```

`generation_jobs` 테이블에는 생성 작업 메타데이터만 저장합니다. 생성 이력은 로그인한 Supabase 사용자 ID 기준으로 저장됩니다.

저장되는 메타데이터는 생성 일시, 이미지 생성 개수, 생성 모드, 배경 설명, 완료 여부, 실패 사유, 소요 시간 등입니다. OpenAI API 키 원문, 원본 이미지, 생성 결과 이미지는 저장하지 않습니다.

기존 `client_key_hash` 컬럼은 이전 API 키 기준 구조와의 호환을 위해 남아 있을 수 있습니다. 새 생성 이력 조회는 `client_key_hash`가 아니라 Supabase Auth의 `user_id` 기준으로 동작합니다.

`user_openai_api_keys` 테이블에는 사용자별 암호화 API 키, 마지막 4자리, 생성/수정 시각만 저장합니다. 클라이언트는 이 테이블을 직접 조회하지 않고 서버 API Route를 통해서만 상태 확인, 저장, 삭제, 테스트를 수행합니다.

실사용 전 Supabase SQL 2개(`docs/generation-jobs.sql`, `docs/user-openai-api-keys.sql`)를 반드시 실행해야 합니다. 실행하지 않으면 관련 API 응답에 `...테이블이 준비되지 않았습니다. docs/....sql을 Supabase에서 실행했는지 확인해 주세요.` 형태의 에러가 표시됩니다.

## 실사용 전 체크리스트

실제 Supabase/OpenAI 환경에 연결하기 전에 확인해야 할 전체 절차(Supabase 준비, 환경변수 설정, 로컬 검증 순서, DB 확인, 보안 확인, 배포 전 확인)는 [`docs/live-checklist.md`](docs/live-checklist.md) 문서를 따르세요.

실제 OpenAI 이미지 생성은 유효한 고객사 OpenAI API 키가 있어야 검증할 수 있습니다. 이 저장소의 `lint`/`typecheck`/`build` 검증만으로는 실제 OpenAI 호출 성공 여부를 확인할 수 없습니다.

### 실환경 검증 순서 요약

1. `GET /api/health`로 필수 환경변수와 DB 테이블이 준비됐는지 먼저 확인합니다. (OpenAI 비용 없음)
2. Supabase 테스트 계정으로 로그인 → API 키 설정 탭에서 키 저장 → 저장된 키 테스트를 진행합니다. (테스트 비용 거의 없음)
3. 이미지 생성 탭에서 1장 생성, 2~4장 생성을 각각 확인합니다. (OpenAI 이미지 생성 비용 발생 가능)
4. 생성 이력 탭, 로그아웃, 비로그인 접근 차단을 확인합니다.

전체 단계별 체크박스와 비용 발생 표시, DB 확인 SQL은 [`docs/live-checklist.md`](docs/live-checklist.md)에 있습니다.

### 진단 API

`GET /api/health`는 로그인이나 OpenAI 호출 없이 서버 환경변수와 DB 테이블 준비 상태를 확인할 수 있는 진단 API입니다. `app`, `database`(`ok`/`error`), `requiredEnv`(`ok`/`missing`), `authEnv`(`ok`/`missing`), 누락된 환경변수 **이름** 목록, 테이블(`generation_jobs`, `user_openai_api_keys`) 존재 여부만 반환하며, 어떤 secret 값도 반환하지 않습니다. 자세한 필드 설명은 [`docs/live-checklist.md`](docs/live-checklist.md)의 "진단 API" 절을 참고하세요.

## 보안 주의사항

- OpenAI Secret key나 service role key를 코드, README, 환경변수 예시에 넣지 마세요.
- Supabase service role key는 이번 단계에서 사용하지 않습니다.
- OpenAI API 키 원문은 Supabase에 저장하지 않습니다.
- API 키가 포함된 요청 본문을 로그로 출력하지 마세요.
- `API_KEY_HASH_SECRET`은 충분히 긴 랜덤 문자열로 설정하고 외부에 공유하지 마세요.
- `OPENAI_API_KEY_ENCRYPTION_SECRET`은 충분히 긴 랜덤 문자열로 설정하고 외부에 공유하지 마세요.
- 원본 이미지와 생성 결과 이미지를 서버 파일로 저장하지 마세요.
- DB에는 `user_id`, 이전 구조 호환용 `client_key_hash`, 생성 모드, 요청 개수, 배경 설명, 상태, 실패 사유, 소요 시간 등 메타데이터만 저장합니다.
- API 키 설정 DB에는 암호화된 API 키와 마지막 4자리만 저장합니다.
- API Route는 요청당 원본 이미지 최대 2장, 이미지당 최대 10MB, 생성 결과 최대 4장으로 제한합니다.
- API Route에는 IP 기반 메모리 rate limit이 적용되어 있습니다.
- `robots.txt`는 검색엔진 수집을 전체 차단합니다.
- 필수 환경변수 누락, DB 테이블 미생성 시에도 한국어로 원인을 알려주는 에러만 반환하며, secret 값 자체는 절대 응답이나 로그에 포함하지 않습니다.

## 주요 명령

```bash
npm run lint
npx tsc --noEmit
npm run build
```

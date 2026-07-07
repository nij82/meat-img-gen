"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const { error } = await createClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage("이메일 또는 비밀번호를 확인해 주세요.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setErrorMessage("로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7f2] px-5 py-10 text-stone-950">
      <section className="w-full max-w-md rounded-md border border-stone-300 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold text-red-800">정육 썸네일 생성기</p>
        <h1 className="mt-2 text-2xl font-black">로그인</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Supabase Dashboard에서 미리 생성된 계정으로 로그인합니다. 공개 회원가입은 제공하지 않습니다.
        </p>

        <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm font-bold text-stone-800">
            이메일
            <input
              autoComplete="email"
              className="h-11 rounded-md border border-stone-300 px-3 text-sm font-medium outline-none focus:border-red-800"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-stone-800">
            비밀번호
            <input
              autoComplete="current-password"
              className="h-11 rounded-md border border-stone-300 px-3 text-sm font-medium outline-none focus:border-red-800"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {errorMessage ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-900" role="alert">
              {errorMessage}
            </div>
          ) : null}

          <button
            className="h-12 rounded-md bg-red-900 px-5 text-sm font-black text-white hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </section>
    </main>
  );
}

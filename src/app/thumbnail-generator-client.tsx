"use client";

/* eslint-disable @next/next/no-img-element */

import JSZip from "jszip";
import { useRouter } from "next/navigation";
import { ChangeEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GenerationMode,
  generationModeGuidelines,
  getGenerationModeLabel,
} from "@/lib/generation-mode-guidelines";
import { createClient } from "@/lib/supabase/client";

const MAX_FILES = 2;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type UploadedImage = {
  id: string;
  file: File;
  previewUrl: string;
};

type GeneratedImage = {
  filename: string;
  dataUrl: string;
};

type JobStatus = "idle" | "running" | "success" | "error";
type ActiveTab = "generate" | "history" | "api-key-settings";
type HistoryStatus = "idle" | "loading" | "error";
type ApiKeySettingsStatus = "idle" | "loading" | "saving" | "testing-input" | "testing-saved" | "deleting";

type GenerationHistory = {
  id: string;
  created_at: string;
  completed_at: string | null;
  requested_count: number;
  mode: GenerationMode;
  background_prompt: string;
  status: "running" | "success" | "error";
  error_message: string | null;
  duration_ms: number | null;
};

type SavedApiKeyStatus = {
  hasKey: true;
  last4: string | null;
  updatedAt: string;
} | {
  hasKey: false;
};

const ERROR_MESSAGES = {
  missingKey: "이미지를 생성하려면 API 키 설정 탭에서 OpenAI API 키를 먼저 저장해 주세요.",
  invalidKey: "저장된 OpenAI API 키가 올바르지 않거나 권한이 없습니다.",
  missingImage: "원본 이미지를 업로드해 주세요.",
  tooManyImages: "원본 이미지는 최대 2장까지 업로드할 수 있습니다.",
  invalidType: "지원하지 않는 이미지 형식입니다.",
  tooLarge: "이미지 파일 용량이 너무 큽니다.",
  generateFailed: "썸네일 생성에 실패했습니다.",
  downloadFailed: "다운로드 파일 생성에 실패했습니다.",
  retry: "잠시 후 다시 시도해 주세요.",
} as const;

export default function ThumbnailGeneratorClient({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [count, setCount] = useState(1);
  const [mode, setMode] = useState<GenerationMode>("general-sale");
  const [background, setBackground] = useState("");
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [jobMessage, setJobMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("generate");
  const [generationHistory, setGenerationHistory] = useState<GenerationHistory[]>([]);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>("idle");
  const [historyErrorMessage, setHistoryErrorMessage] = useState("");
  const [savedApiKeyStatus, setSavedApiKeyStatus] = useState<SavedApiKeyStatus>({ hasKey: false });
  const [apiKeySettingsInput, setApiKeySettingsInput] = useState("");
  const [showApiKeySettingsInput, setShowApiKeySettingsInput] = useState(false);
  const [apiKeySettingsStatus, setApiKeySettingsStatus] = useState<ApiKeySettingsStatus>("idle");
  const [apiKeySettingsMessage, setApiKeySettingsMessage] = useState("");
  const [apiKeySettingsErrorMessage, setApiKeySettingsErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imagesRef = useRef<UploadedImage[]>([]);

  const hasApiKey = savedApiKeyStatus.hasKey;
  const isRunning = jobStatus === "running";
  const isApiKeySettingsBusy = apiKeySettingsStatus !== "idle";

  const clearSessionState = useCallback((force = false) => {
    if (isRunning && !force) return;
    images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    setImages([]);
    setResults([]);
    setJobStatus("idle");
    setJobMessage("");
    setErrorMessage("");
    setActiveTab("generate");
    setGenerationHistory([]);
    setHistoryStatus("idle");
    setHistoryErrorMessage("");
    setApiKeySettingsInput("");
    setShowApiKeySettingsInput(false);
    setApiKeySettingsStatus("idle");
    setApiKeySettingsMessage("");
    setApiKeySettingsErrorMessage("");
    setBackground("");
    setCount(1);
    setMode("general-sale");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [images, isRunning]);

  const handleLogout = useCallback(async () => {
    if (isRunning) return;
    clearSessionState(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }, [clearSessionState, isRunning, router]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    };
  }, []);

  const disabled = !hasApiKey || isRunning;
  const canGenerate = hasApiKey && images.length > 0 && !isRunning;
  const canDownload = jobStatus === "success" && results.length > 0 && !isRunning;

  const modeDescription = useMemo(() => {
    return generationModeGuidelines[mode].description;
  }, [mode]);

  const fetchGenerationHistory = useCallback(async () => {
    setHistoryStatus("loading");
    setHistoryErrorMessage("");

    try {
      const response = await fetch("/api/generation-history", {
        method: "POST",
      });
      const payload = await response.json().catch(() => null) as
        | { jobs?: GenerationHistory[]; error?: string }
        | null;

      if (!response.ok) {
        setHistoryStatus("error");
        setHistoryErrorMessage(payload?.error ?? "생성 이력을 불러오지 못했습니다.");
        return;
      }

      setGenerationHistory(payload?.jobs ?? []);
      setHistoryStatus("idle");
    } catch {
      setHistoryStatus("error");
      setHistoryErrorMessage("생성 이력을 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    if (activeTab === "history" && !isRunning) {
      void fetchGenerationHistory();
    }
  }, [activeTab, fetchGenerationHistory, isRunning]);

  const fetchSavedOpenAiApiKeyStatus = useCallback(async () => {
    setApiKeySettingsStatus("loading");
    setApiKeySettingsErrorMessage("");

    try {
      const response = await fetch("/api/openai-api-key");
      const payload = await response.json().catch(() => null) as
        | (SavedApiKeyStatus & { error?: string })
        | null;

      if (!response.ok) {
        setApiKeySettingsErrorMessage(payload?.error ?? "저장된 API 키 상태를 불러오지 못했습니다.");
        return;
      }

      setSavedApiKeyStatus(payload?.hasKey ? {
        hasKey: true,
        last4: payload.last4 ?? null,
        updatedAt: payload.updatedAt,
      } : { hasKey: false });
    } catch {
      setApiKeySettingsErrorMessage("저장된 API 키 상태를 불러오지 못했습니다.");
    } finally {
      setApiKeySettingsStatus("idle");
    }
  }, []);

  useEffect(() => {
    void fetchSavedOpenAiApiKeyStatus();
  }, [fetchSavedOpenAiApiKeyStatus]);

  useEffect(() => {
    if (activeTab === "api-key-settings" && !isRunning) {
      void fetchSavedOpenAiApiKeyStatus();
    }
  }, [activeTab, fetchSavedOpenAiApiKeyStatus, isRunning]);

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    if (isRunning) return;
    clearJobFeedback();
    const selected = Array.from(event.target.files ?? []);
    if (!selected.length) return;

    if (images.length + selected.length > MAX_FILES) {
      showJobError(ERROR_MESSAGES.tooManyImages);
      event.target.value = "";
      return;
    }

    const nextImages: UploadedImage[] = [];
    for (const file of selected) {
      if (!ACCEPTED_TYPES.has(file.type)) {
        showJobError(ERROR_MESSAGES.invalidType);
        event.target.value = "";
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        showJobError(ERROR_MESSAGES.tooLarge);
        event.target.value = "";
        return;
      }

      nextImages.push({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    setImages((current) => [...current, ...nextImages]);
    setResults([]);
    event.target.value = "";
  }

  function removeImage(id: string) {
    if (isRunning) return;
    setImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((image) => image.id !== id);
    });
    setResults([]);
  }

  async function generateThumbnails() {
    if (isRunning) return;
    clearJobFeedback();

    if (!hasApiKey) {
      showJobError(ERROR_MESSAGES.missingKey);
      return;
    }
    if (!images.length) {
      showJobError(ERROR_MESSAGES.missingImage);
      return;
    }

    setJobStatus("running");
    setJobMessage("썸네일 생성 작업이 진행 중입니다. 잠시만 기다려 주세요.");
    setErrorMessage("");
    setResults([]);

    try {
      setJobMessage("이미지를 준비하고 있습니다...");
      const formData = new FormData();
      formData.append("count", String(count));
      formData.append("mode", mode);
      formData.append("background", background);
      images.forEach((image) => formData.append("images", image.file));

      setJobMessage("OpenAI에 생성 요청 중입니다...");
      const response = await fetch("/api/generate-thumbnails", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => null) as
        | { images?: GeneratedImage[]; error?: string; jobId?: string }
        | null;

      if (!response.ok) {
        void fetchGenerationHistory();
        showJobError(payload?.error ?? ERROR_MESSAGES.generateFailed);
        return;
      }

      setJobMessage("생성 결과를 후처리하고 있습니다...");
      const generatedImages = payload?.images ?? [];
      if (!generatedImages.length) {
        void fetchGenerationHistory();
        showJobError(ERROR_MESSAGES.generateFailed);
        return;
      }

      setResults(generatedImages);
      setJobStatus("success");
      setJobMessage("썸네일 생성이 완료되었습니다.");
      void fetchGenerationHistory();
    } catch {
      void fetchGenerationHistory();
      showJobError(ERROR_MESSAGES.generateFailed);
    }
  }

  async function downloadResults() {
    if (!canDownload) return;
    setErrorMessage("");
    setJobMessage("다운로드 파일을 준비하고 있습니다...");

    try {
      if (results.length === 1) {
        downloadDataUrl(results[0].dataUrl, "thumbnail_01.jpg");
        setJobMessage("썸네일 생성이 완료되었습니다.");
        return;
      }

      const zip = new JSZip();
      for (const result of results) {
        const blob = await fetch(result.dataUrl).then((response) => response.blob());
        zip.file(result.filename, blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, "thumbnails.zip");
      setJobMessage("썸네일 생성이 완료되었습니다.");
    } catch {
      setJobStatus("error");
      setErrorMessage(ERROR_MESSAGES.downloadFailed);
      setJobMessage("다운로드 파일 생성에 실패했습니다.");
    }
  }

  async function saveStoredApiKey() {
    const trimmedApiKey = apiKeySettingsInput.trim();
    if (!trimmedApiKey || isApiKeySettingsBusy) return;

    setApiKeySettingsStatus("saving");
    setApiKeySettingsMessage("");
    setApiKeySettingsErrorMessage("");

    try {
      const response = await fetch("/api/openai-api-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey: trimmedApiKey }),
      });
      const payload = await response.json().catch(() => null) as
        | { ok?: boolean; last4?: string; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setApiKeySettingsErrorMessage(payload?.error ?? "API 키를 저장하지 못했습니다.");
        return;
      }

      setSavedApiKeyStatus({ hasKey: true, last4: payload.last4 ?? null, updatedAt: new Date().toISOString() });
      setApiKeySettingsInput("");
      setShowApiKeySettingsInput(false);
      setApiKeySettingsMessage("API 키를 암호화해 저장했습니다.");
      void fetchSavedOpenAiApiKeyStatus();
    } catch {
      setApiKeySettingsErrorMessage("API 키를 저장하지 못했습니다.");
    } finally {
      setApiKeySettingsStatus("idle");
    }
  }

  async function testInputApiKey() {
    const trimmedApiKey = apiKeySettingsInput.trim();
    if (!trimmedApiKey || isApiKeySettingsBusy) return;

    await testApiKey({
      status: "testing-input",
      body: { apiKey: trimmedApiKey },
      successMessage: "입력한 API 키 연결 테스트에 성공했습니다.",
    });
  }

  async function testSavedApiKey() {
    if (!savedApiKeyStatus.hasKey || isApiKeySettingsBusy) return;

    await testApiKey({
      status: "testing-saved",
      body: {},
      successMessage: "저장된 API 키 연결 테스트에 성공했습니다.",
    });
  }

  async function testApiKey(input: {
    status: ApiKeySettingsStatus;
    body: { apiKey?: string };
    successMessage: string;
  }) {
    setApiKeySettingsStatus(input.status);
    setApiKeySettingsMessage("");
    setApiKeySettingsErrorMessage("");

    try {
      const response = await fetch("/api/openai-api-key/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input.body),
      });
      const payload = await response.json().catch(() => null) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setApiKeySettingsErrorMessage(payload?.error ?? "API 키 연결 테스트에 실패했습니다.");
        return;
      }

      setApiKeySettingsMessage(input.successMessage);
    } catch {
      setApiKeySettingsErrorMessage("API 키 연결 테스트에 실패했습니다.");
    } finally {
      setApiKeySettingsStatus("idle");
    }
  }

  async function deleteStoredApiKey() {
    if (!savedApiKeyStatus.hasKey || isApiKeySettingsBusy) return;
    if (!window.confirm("저장된 OpenAI API 키를 삭제할까요?")) return;

    setApiKeySettingsStatus("deleting");
    setApiKeySettingsMessage("");
    setApiKeySettingsErrorMessage("");

    try {
      const response = await fetch("/api/openai-api-key", {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setApiKeySettingsErrorMessage(payload?.error ?? "API 키를 삭제하지 못했습니다.");
        return;
      }

      setSavedApiKeyStatus({ hasKey: false });
      setApiKeySettingsMessage("저장된 API 키를 삭제했습니다.");
    } catch {
      setApiKeySettingsErrorMessage("API 키를 삭제하지 못했습니다.");
    } finally {
      setApiKeySettingsStatus("idle");
    }
  }

  function clearJobFeedback() {
    setJobStatus((current) => (current === "running" ? current : "idle"));
    setJobMessage("");
    setErrorMessage("");
  }

  function showJobError(message: string) {
    setJobStatus("error");
    setJobMessage("작업을 완료하지 못했습니다.");
    setErrorMessage(message);
  }

  return (
    <main className="min-h-screen bg-[#f6f7f2] text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="border-b border-stone-300 pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-bold text-red-800">OpenAI Images API 기반</p>
              <h1 className="mt-2 text-3xl font-black tracking-normal sm:text-4xl">정육 썸네일 생성기</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-700">
                원본 정육 사진을 기반으로 쇼핑몰 대표 썸네일을 생성합니다. 텍스트, 로고, 가격, 라벨은 이미지 안에 넣지 않습니다.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
              <p className="text-sm font-bold text-stone-700">
                로그인: <span className="text-stone-950">{userEmail}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="h-11 rounded-md border border-stone-300 px-4 text-sm font-bold text-stone-800 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isRunning || (!images.length && !results.length)}
                  onClick={() => clearSessionState()}
                  type="button"
                >
                  작업 초기화
                </button>
                <button
                  className="h-11 rounded-md border border-red-800 px-4 text-sm font-bold text-red-900 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isRunning}
                  onClick={handleLogout}
                  type="button"
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="mt-5 flex gap-2 border-b border-stone-300">
          <TabButton active={activeTab === "generate"} disabled={isRunning} onClick={() => setActiveTab("generate")}>
            이미지 생성
          </TabButton>
          <TabButton active={activeTab === "history"} disabled={isRunning} onClick={() => setActiveTab("history")}>
            생성 이력
          </TabButton>
          <TabButton active={activeTab === "api-key-settings"} disabled={isRunning} onClick={() => setActiveTab("api-key-settings")}>
            API 키 설정
          </TabButton>
        </div>

        {activeTab === "generate" ? (
          <section className="relative grid flex-1 gap-6 py-6 lg:grid-cols-[380px_minmax(0,1fr)]" aria-busy={isRunning}>
            {isRunning ? (
              <div className="absolute inset-0 z-20 flex items-start justify-center rounded-md bg-stone-950/20 px-4 pt-24 backdrop-blur-[1px]">
                <div className="flex w-full max-w-md items-start gap-4 rounded-md border border-red-200 bg-white p-5 shadow-xl">
                  <span className="mt-1 size-6 shrink-0 animate-spin rounded-full border-3 border-red-200 border-t-red-900" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-black text-red-950">생성 작업 진행 중</p>
                    <p className="mt-2 text-sm leading-6 text-stone-700">{jobMessage || "썸네일 생성 작업이 진행 중입니다. 잠시만 기다려 주세요."}</p>
                  </div>
                </div>
              </div>
            ) : null}
            <aside className="space-y-4">
              <section className={`rounded-md border p-5 shadow-sm ${hasApiKey ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                <h2 className="text-base font-black">OpenAI API 키 상태</h2>
                {hasApiKey ? (
                  <p className="mt-2 text-sm font-bold leading-6 text-emerald-900">
                    저장된 OpenAI API 키를 사용합니다. (****{savedApiKeyStatus.hasKey ? savedApiKeyStatus.last4 ?? "----" : "----"})
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-sm font-bold leading-6 text-red-900">
                      이미지를 생성하려면 API 키 설정 탭에서 OpenAI API 키를 먼저 저장해 주세요.
                    </p>
                    <button
                      className="mt-4 h-11 rounded-md bg-red-900 px-4 text-sm font-black text-white hover:bg-red-950"
                      onClick={() => setActiveTab("api-key-settings")}
                      type="button"
                    >
                      API 키 설정으로 이동
                    </button>
                  </>
                )}
              </section>

              <section className={`rounded-md border border-stone-300 bg-white p-5 shadow-sm ${!hasApiKey ? "opacity-55" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-black">원본 이미지</h2>
                  <span className="text-xs font-bold text-stone-500">{images.length}/{MAX_FILES}</span>
                </div>
                <input
                  accept="image/jpeg,image/png,image/webp"
                  className="mt-4 block w-full text-sm file:mr-3 file:h-10 file:rounded-md file:border-0 file:bg-stone-900 file:px-4 file:text-sm file:font-bold file:text-white disabled:cursor-not-allowed"
                  disabled={disabled || images.length >= MAX_FILES}
                  multiple
                  onChange={handleFiles}
                  ref={fileInputRef}
                  type="file"
                />
                <p className="mt-2 text-xs leading-5 text-stone-500">JPG, PNG, WEBP만 허용합니다. 이미지당 최대 10MB입니다.</p>

                <div className="mt-4 grid gap-3">
                  {images.map((image) => (
                    <div className="grid grid-cols-[72px_1fr_auto] items-center gap-3 rounded-md border border-stone-200 p-2" key={image.id}>
                      <img alt="" className="size-[72px] rounded object-cover" src={image.previewUrl} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{image.file.name}</p>
                        <p className="text-xs text-stone-500">{(image.file.size / 1024 / 1024).toFixed(2)}MB</p>
                      </div>
                      <button className="rounded-md border border-stone-300 px-3 py-2 text-xs font-bold hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50" disabled={isRunning} onClick={() => removeImage(image.id)} type="button">
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </aside>

            <section className="space-y-4">
              <section className={`rounded-md border border-stone-300 bg-white p-5 shadow-sm ${!hasApiKey ? "opacity-55" : ""}`}>
                <div className="grid gap-5 xl:grid-cols-2">
                  <div>
                    <h2 className="text-base font-black">생성 옵션</h2>
                    <div className="mt-4 grid gap-4">
                      <label className="grid gap-2 text-sm font-bold">
                        생성 개수
                        <select className="h-11 rounded-md border border-stone-300 px-3 text-sm font-medium" disabled={disabled} onChange={(event) => setCount(Number(event.target.value))} value={count}>
                          {[1, 2, 3, 4].map((value) => (
                            <option key={value} value={value}>{value}장</option>
                          ))}
                        </select>
                      </label>
                      <fieldset disabled={disabled}>
                        <legend className="text-sm font-bold">생성 모드</legend>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {[
                            ["general-sale", "일반판매용"],
                            ["gift-set", "선물세트용"],
                          ].map(([value, label]) => (
                            <button
                              className={`h-11 rounded-md border px-3 text-sm font-bold ${mode === value ? "border-red-800 bg-red-900 text-white" : "border-stone-300 hover:bg-stone-50"}`}
                              disabled={disabled}
                              key={value}
                              onClick={() => setMode(value as GenerationMode)}
                              type="button"
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                      <label className="grid gap-2 text-sm font-bold">
                        배경 설명
                        <textarea
                          className="min-h-28 rounded-md border border-stone-300 p-3 text-sm font-medium outline-none focus:border-red-800"
                          disabled={disabled}
                          onChange={(event) => setBackground(event.target.value)}
                          placeholder="밝은 흰색 스튜디오 배경, 고급스러운 다크 우드 배경, 명절 선물세트 느낌의 깔끔한 배경"
                          value={background}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="rounded-md bg-stone-100 p-4">
                    <p className="text-sm font-black">생성 기준</p>
                    <ul className="mt-3 grid gap-2 text-sm leading-6 text-stone-700">
                      <li>현재 모드: {modeDescription}</li>
                      <li>고기 양, 형태, 색감, 마블링, 부위는 과장하지 않습니다.</li>
                      <li>다른 부위나 임의 구성품으로 바꾸지 않습니다.</li>
                      <li>텍스트, 로고, 가격, 라벨, 배지는 넣지 않습니다.</li>
                    </ul>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    className="h-12 rounded-md bg-red-900 px-5 text-sm font-black text-white hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canGenerate}
                    onClick={generateThumbnails}
                    type="button"
                  >
                    {isRunning ? "생성 중..." : "썸네일 생성"}
                  </button>
                  <button
                    className="h-12 rounded-md border border-stone-300 px-5 text-sm font-black hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canDownload}
                    onClick={downloadResults}
                    type="button"
                  >
                    {results.length > 1 ? "ZIP 다운로드" : "이미지 다운로드"}
                  </button>
                </div>

                <JobStatusPanel status={jobStatus} message={jobMessage} errorMessage={errorMessage} />
              </section>

              <section className="rounded-md border border-stone-300 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-black">생성 결과</h2>
                  <span className="text-xs font-bold text-stone-500">{results.length ? `${results.length}개 생성됨` : "대기 중"}</span>
                </div>
                {results.length ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {results.map((result) => (
                      <figure className="rounded-md border border-stone-200 p-2" key={result.filename}>
                        <img alt={result.filename} className="aspect-square w-full rounded object-cover" src={result.dataUrl} />
                        <figcaption className="mt-2 truncate text-xs font-bold text-stone-600">{result.filename}</figcaption>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 flex min-h-80 items-center justify-center rounded-md border border-dashed border-stone-300 bg-stone-50 px-4 text-center text-sm font-semibold text-stone-500">
                    API 키와 원본 이미지를 준비한 뒤 썸네일을 생성하세요.
                  </div>
                )}
              </section>
            </section>
          </section>
        ) : activeTab === "history" ? (
          <GenerationHistoryPanel
            errorMessage={historyErrorMessage}
            history={generationHistory}
            status={historyStatus}
          />
        ) : (
          <ApiKeySettingsPanel
            inputValue={apiKeySettingsInput}
            isBusy={isApiKeySettingsBusy}
            message={apiKeySettingsMessage}
            onDeleteSavedKey={deleteStoredApiKey}
            onInputChange={(value) => {
              setApiKeySettingsInput(value);
              setApiKeySettingsMessage("");
              setApiKeySettingsErrorMessage("");
            }}
            onSave={saveStoredApiKey}
            onTestInput={testInputApiKey}
            onTestSaved={testSavedApiKey}
            onToggleShowInput={() => setShowApiKeySettingsInput((value) => !value)}
            savedKeyStatus={savedApiKeyStatus}
            showInputValue={showApiKeySettingsInput}
            status={apiKeySettingsStatus}
            errorMessage={apiKeySettingsErrorMessage}
          />
        )}

        <footer className="border-t border-stone-300 py-4 text-xs font-semibold text-stone-600">
          이미지 생성은 API 키 설정 탭에 저장된 OpenAI API 키를 서버에서 복호화해 사용합니다.
        </footer>
      </div>
    </main>
  );
}

function JobStatusPanel({
  status,
  message,
  errorMessage,
}: {
  status: JobStatus;
  message: string;
  errorMessage: string;
}) {
  if (status === "idle" && !message && !errorMessage) return null;

  const styles = {
    idle: "border-stone-200 bg-stone-50 text-stone-700",
    running: "border-red-200 bg-red-50 text-red-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
    error: "border-red-300 bg-red-50 text-red-950",
  } satisfies Record<JobStatus, string>;

  const title = {
    idle: "대기 중",
    running: "작업 중",
    success: "완료",
    error: "오류",
  } satisfies Record<JobStatus, string>;

  return (
    <div className={`mt-5 rounded-md border px-4 py-3 ${styles[status]}`} role={status === "error" ? "alert" : "status"}>
      <div className="flex items-start gap-3">
        {status === "running" ? (
          <span className="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-red-200 border-t-red-900" aria-hidden="true" />
        ) : (
          <span className="mt-1 size-2.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
        )}
        <div>
          <p className="text-sm font-black">{title[status]}</p>
          {message ? <p className="mt-1 text-sm leading-6">{message}</p> : null}
          {errorMessage ? (
            <p className="mt-2 rounded border border-red-200 bg-white/70 px-3 py-2 text-sm font-bold text-red-900">
              {errorMessage}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  children,
  disabled,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`border-b-2 px-4 py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "border-red-900 text-red-950"
          : "border-transparent text-stone-500 hover:text-stone-950"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function GenerationHistoryPanel({
  errorMessage,
  history,
  status,
}: {
  errorMessage: string;
  history: GenerationHistory[];
  status: HistoryStatus;
}) {
  return (
    <section className="py-6">
      <div className="rounded-md border border-stone-300 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-black">생성 이력</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              로그인한 계정으로 생성한 이력을 확인할 수 있습니다.
            </p>
          </div>
          <span className="text-xs font-bold text-stone-500">{history.length}건</span>
        </div>

        {status === "loading" ? (
          <div className="mt-5 flex min-h-72 items-center justify-center rounded-md border border-stone-200 bg-stone-50 px-4 text-center text-sm font-black text-stone-600">
            <span className="mr-3 size-5 animate-spin rounded-full border-2 border-stone-300 border-t-red-900" aria-hidden="true" />
            생성 이력을 불러오는 중입니다.
          </div>
        ) : status === "error" ? (
          <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900" role="alert">
            {errorMessage || "생성 이력을 불러오지 못했습니다."}
          </div>
        ) : history.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs font-black text-stone-500">
                  <th className="py-3 pr-4">생성 일시</th>
                  <th className="py-3 pr-4">이미지 생성 개수</th>
                  <th className="py-3 pr-4">생성 모드</th>
                  <th className="py-3 pr-4">배경 설명</th>
                  <th className="py-3 pr-4">완료 여부</th>
                  <th className="py-3 pr-4">실패 사유</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr className="border-b border-stone-100 last:border-0" key={item.id}>
                    <td className="py-3 pr-4 font-semibold text-stone-800">{formatHistoryDate(item.created_at)}</td>
                    <td className="py-3 pr-4 text-stone-700">{item.requested_count}장</td>
                    <td className="py-3 pr-4 text-stone-700">{getGenerationModeLabel(item.mode)}</td>
                    <td className="max-w-md py-3 pr-4 text-stone-700">
                      <span className="line-clamp-2">
                        {item.background_prompt.trim() || "입력 없음"}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${
                          item.status === "success"
                            ? "bg-emerald-100 text-emerald-800"
                            : item.status === "running"
                              ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {getHistoryStatusLabel(item.status)}
                      </span>
                    </td>
                    <td className="max-w-xs py-3 pr-4 text-stone-700">
                      {item.error_message || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5 flex min-h-72 items-center justify-center rounded-md border border-dashed border-stone-300 bg-stone-50 px-4 text-center text-sm font-semibold text-stone-500">
            아직 생성 이력이 없습니다.
          </div>
        )}
      </div>
    </section>
  );
}

function ApiKeySettingsPanel({
  errorMessage,
  inputValue,
  isBusy,
  message,
  onDeleteSavedKey,
  onInputChange,
  onSave,
  onTestInput,
  onTestSaved,
  onToggleShowInput,
  savedKeyStatus,
  showInputValue,
  status,
}: {
  errorMessage: string;
  inputValue: string;
  isBusy: boolean;
  message: string;
  onDeleteSavedKey: () => void;
  onInputChange: (value: string) => void;
  onSave: () => void;
  onTestInput: () => void;
  onTestSaved: () => void;
  onToggleShowInput: () => void;
  savedKeyStatus: SavedApiKeyStatus;
  showInputValue: boolean;
  status: ApiKeySettingsStatus;
}) {
  const hasInput = inputValue.trim().length > 0;

  return (
    <section className="py-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-md border border-stone-300 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-black">API 키 설정</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                API 키는 암호화되어 저장됩니다. 저장된 API 키 원문은 다시 표시되지 않습니다.
              </p>
            </div>
            <SavedApiKeyBadge savedKeyStatus={savedKeyStatus} status={status} />
          </div>

          <div className="mt-5 rounded-md border border-stone-200 bg-stone-50 p-4">
            <p className="text-sm font-black text-stone-900">
              {savedKeyStatus.hasKey
                ? `저장된 API 키: ****${savedKeyStatus.last4 ?? "----"}`
                : "저장된 키 없음"}
            </p>
            {savedKeyStatus.hasKey ? (
              <p className="mt-2 text-xs font-semibold text-stone-500">
                마지막 수정: {formatHistoryDate(savedKeyStatus.updatedAt)}
              </p>
            ) : null}
          </div>

          <label className="mt-5 block text-sm font-bold text-stone-800" htmlFor="stored-api-key">
            새 OpenAI API 키
          </label>
          <div className="mt-2 flex gap-2">
            <input
              autoComplete="off"
              className="h-11 min-w-0 flex-1 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-red-800"
              disabled={isBusy}
              id="stored-api-key"
              onChange={(event) => onInputChange(event.target.value)}
              placeholder="OpenAI API 키 입력"
              type={showInputValue ? "text" : "password"}
              value={inputValue}
            />
            <button
              className="h-11 shrink-0 rounded-md border border-stone-300 px-3 text-sm font-bold hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isBusy}
              onClick={onToggleShowInput}
              type="button"
            >
              {showInputValue ? "숨기기" : "보기"}
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              className="h-11 rounded-md bg-red-900 px-4 text-sm font-black text-white hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!hasInput || isBusy}
              onClick={onSave}
              type="button"
            >
              {status === "saving" ? "저장 중..." : "API 키 저장"}
            </button>
            <button
              className="h-11 rounded-md border border-stone-300 px-4 text-sm font-black hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!hasInput || isBusy}
              onClick={onTestInput}
              type="button"
            >
              {status === "testing-input" ? "테스트 중..." : "입력한 키 테스트"}
            </button>
            <button
              className="h-11 rounded-md border border-stone-300 px-4 text-sm font-black hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!savedKeyStatus.hasKey || isBusy}
              onClick={onTestSaved}
              type="button"
            >
              {status === "testing-saved" ? "테스트 중..." : "저장된 키 테스트"}
            </button>
            <button
              className="h-11 rounded-md border border-red-800 px-4 text-sm font-black text-red-900 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!savedKeyStatus.hasKey || isBusy}
              onClick={onDeleteSavedKey}
              type="button"
            >
              {status === "deleting" ? "삭제 중..." : "저장된 키 삭제"}
            </button>
          </div>

          {message ? (
            <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900" role="status">
              {message}
            </div>
          ) : null}
          {errorMessage ? (
            <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900" role="alert">
              {errorMessage}
            </div>
          ) : null}
        </section>

        <aside className="rounded-md border border-stone-300 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-black text-stone-900">저장 방식</h3>
          <ul className="mt-3 grid gap-2 text-sm leading-6 text-stone-700">
            <li>API 키를 교체하려면 새 키를 입력해 다시 저장하세요.</li>
            <li>저장된 API 키는 이미지 생성 탭의 썸네일 생성 요청에 사용됩니다.</li>
            <li>저장된 API 키를 삭제하면 이후 이미지 생성이 불가능합니다.</li>
            <li>원본 이미지와 생성 결과 이미지는 저장하지 않습니다.</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}

function SavedApiKeyBadge({
  savedKeyStatus,
  status,
}: {
  savedKeyStatus: SavedApiKeyStatus;
  status: ApiKeySettingsStatus;
}) {
  if (status === "loading") {
    return (
      <span className="inline-flex h-8 items-center rounded-full bg-stone-100 px-3 text-xs font-black text-stone-600">
        상태 확인 중
      </span>
    );
  }

  return (
    <span className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-black ${
      savedKeyStatus.hasKey
        ? "bg-emerald-100 text-emerald-800"
        : "bg-stone-100 text-stone-600"
    }`}>
      {savedKeyStatus.hasKey ? "저장된 키 있음" : "저장된 키 없음"}
    </span>
  );
}

function getHistoryStatusLabel(status: GenerationHistory["status"]) {
  if (status === "success") return "완료";
  if (status === "running") return "진행 중";
  return "실패";
}

function formatHistoryDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

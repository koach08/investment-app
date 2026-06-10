"use client";

/**
 * 音声入力 (STT) と読み上げ (TTS) のヘルパー。
 * 第一候補: OpenAI (Whisper 文字起こし + OpenAI TTS)。既存の OPENAI_API_KEY を使用 (Azure不要)。
 * フォールバック: ブラウザ標準 Web Speech API (キー不要)。
 * OpenAI が使えない場合は自動でブラウザ側に切り替わる。
 *
 * 注: STT は「録音→停止→文字起こし」方式 (リアルタイム逐次ではない)。
 *     停止した時点で音声を Whisper に送り、確定テキストを onResult で返す。
 */

export interface RecognitionHandle {
  stop: () => void;
}

interface RecognitionOpts {
  onResult: (text: string) => void;
  onPartial?: (text: string) => void;
  onError?: (message: string) => void;
  lang?: string;
}

// ===== STT =====

export async function startRecognition(opts: RecognitionOpts): Promise<RecognitionHandle> {
  const canRecord =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  if (!canRecord) {
    return browserRecognition(opts);
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    opts.onError?.("マイクへのアクセスが許可されませんでした");
    return { stop: () => {} };
  }

  const mime = pickMime();
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    try {
      const text = await transcribe(blob);
      if (text) opts.onResult(text);
    } catch (e) {
      opts.onError?.(e instanceof Error ? e.message : "音声認識に失敗しました");
    }
  };

  recorder.start();
  return {
    stop: () => {
      if (recorder.state !== "inactive") recorder.stop();
    },
  };
}

async function transcribe(blob: Blob): Promise<string> {
  const ext = blob.type.includes("mp4")
    ? "mp4"
    : blob.type.includes("ogg")
    ? "ogg"
    : "webm";
  const fd = new FormData();
  fd.append("file", blob, `audio.${ext}`);
  const res = await fetch("/api/speech/transcribe", { method: "POST", body: fd });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `文字起こし失敗 (${res.status})`);
  }
  const data = await res.json();
  return (data.text || "").trim();
}

function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return null;
  const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const c of cands) if (MediaRecorder.isTypeSupported(c)) return c;
  return null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function browserRecognition(opts: RecognitionOpts): RecognitionHandle {
  const SR =
    (typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
    null;
  if (!SR) {
    opts.onError?.("このブラウザは音声入力に非対応です（Chrome / Safari 推奨）");
    return { stop: () => {} };
  }
  const rec = new SR();
  rec.lang = opts.lang || "ja-JP";
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (e: any) => {
    let finalText = "";
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t;
      else interim += t;
    }
    if (finalText) opts.onResult(finalText);
    else if (interim) opts.onPartial?.(interim);
  };
  rec.onerror = (e: any) => opts.onError?.(e.error || "音声認識エラー");

  try {
    rec.start();
  } catch (e) {
    opts.onError?.(e instanceof Error ? e.message : "マイクを起動できませんでした");
  }
  return {
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ===== TTS =====

let activeAudio: HTMLAudioElement | null = null;

export function stopSpeaking() {
  if (activeAudio) {
    try {
      activeAudio.pause();
    } catch {
      /* noop */
    }
    activeAudio = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export async function speak(text: string): Promise<void> {
  const clean = stripMarkdown(text);
  if (!clean.trim()) return;
  try {
    await openaiSpeak(clean);
  } catch {
    await browserSpeak(clean);
  }
}

async function openaiSpeak(clean: string): Promise<void> {
  stopSpeaking();
  const res = await fetch("/api/speech/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: clean }),
  });
  if (!res.ok) throw new Error("読み上げ失敗");

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  activeAudio = audio;

  await new Promise<void>((resolve) => {
    const done = () => {
      URL.revokeObjectURL(url);
      if (activeAudio === audio) activeAudio = null;
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(() => done());
  });
}

function browserSpeak(clean: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = "ja-JP";
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

/** 読み上げ用に Markdown 記号・テーブル・URL を簡易除去 */
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\|/g, " ")
    .replace(/[#*_>`~-]/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

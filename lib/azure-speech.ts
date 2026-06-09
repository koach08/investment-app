"use client";

/**
 * 音声入力 (STT) と読み上げ (TTS) のヘルパー。
 * 第一候補: Azure Speech (高品質)。トークンは /api/speech/token から取得 (key はサーバ隠蔽)。
 * フォールバック: ブラウザ標準 Web Speech API (キー不要・Chrome/Safari)。
 * Azure が使えない (キー未設定/失効など) 場合は自動でブラウザ側に切り替わる。
 */

import type {
  SpeechRecognizer,
  SpeechSynthesizer,
} from "microsoft-cognitiveservices-speech-sdk";

interface TokenResponse {
  token: string;
  region: string;
}

async function getToken(): Promise<TokenResponse> {
  const res = await fetch("/api/speech/token", { cache: "no-store" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `token 取得失敗 (${res.status})`);
  }
  return res.json();
}

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
  try {
    return await azureRecognition(opts);
  } catch {
    // Azure 不可 → ブラウザ標準にフォールバック
    return browserRecognition(opts);
  }
}

async function azureRecognition(opts: RecognitionOpts): Promise<RecognitionHandle> {
  const sdk = await import("microsoft-cognitiveservices-speech-sdk");
  const { token, region } = await getToken(); // 401 等ならここで throw → フォールバック

  const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(token, region);
  speechConfig.speechRecognitionLanguage = opts.lang || "ja-JP";

  const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
  const recognizer: SpeechRecognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

  recognizer.recognizing = (_s, e) => {
    if (e.result.text) opts.onPartial?.(e.result.text);
  };
  recognizer.recognized = (_s, e) => {
    if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text) {
      opts.onResult(e.result.text);
    }
  };
  recognizer.canceled = (_s, e) => {
    opts.onError?.(e.errorDetails || "音声認識がキャンセルされました");
    recognizer.stopContinuousRecognitionAsync(() => recognizer.close());
  };

  await new Promise<void>((resolve, reject) => {
    recognizer.startContinuousRecognitionAsync(
      () => resolve(),
      (err) => reject(new Error(String(err)))
    );
  });

  return {
    stop: () => recognizer.stopContinuousRecognitionAsync(() => recognizer.close()),
  };
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
  return { stop: () => { try { rec.stop(); } catch { /* noop */ } } };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ===== TTS =====

let activeSynth: SpeechSynthesizer | null = null;

export function stopSpeaking() {
  if (activeSynth) {
    try {
      activeSynth.close();
    } catch {
      /* noop */
    }
    activeSynth = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export async function speak(text: string, voice = "ja-JP-NanamiNeural"): Promise<void> {
  const clean = stripMarkdown(text);
  if (!clean.trim()) return;
  try {
    await azureSpeak(clean, voice);
  } catch {
    await browserSpeak(clean);
  }
}

async function azureSpeak(clean: string, voice: string): Promise<void> {
  stopSpeaking();
  const sdk = await import("microsoft-cognitiveservices-speech-sdk");
  const { token, region } = await getToken(); // 失敗 → throw → ブラウザTTS

  const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(token, region);
  speechConfig.speechSynthesisVoiceName = voice;

  const synth = new sdk.SpeechSynthesizer(speechConfig);
  activeSynth = synth;

  await new Promise<void>((resolve, reject) => {
    synth.speakTextAsync(
      clean,
      (result) => {
        synth.close();
        if (activeSynth === synth) activeSynth = null;
        // 認証/合成失敗時は reject してブラウザにフォールバック
        if (
          result.reason === sdk.ResultReason.Canceled
        ) {
          reject(new Error("Azure 合成失敗"));
        } else {
          resolve();
        }
      },
      (err) => {
        synth.close();
        if (activeSynth === synth) activeSynth = null;
        reject(new Error(String(err)));
      }
    );
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

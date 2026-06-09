"use client";

/**
 * Azure Speech のブラウザ側ヘルパー (音声入力 STT + 読み上げ TTS)。
 * SDK はブラウザ専用なので動的 import する。
 * トークンは /api/speech/token から取得 (key はサーバ側に隠蔽)。
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

/** 音声認識ハンドル。stop() で停止。 */
export interface RecognitionHandle {
  stop: () => void;
}

/**
 * マイクから日本語音声を認識し、確定テキストをコールバックで返す。
 * onPartial で認識途中の暫定テキストも返す (UI のリアルタイム表示用)。
 */
export async function startRecognition(opts: {
  onResult: (text: string) => void;
  onPartial?: (text: string) => void;
  onError?: (message: string) => void;
  lang?: string;
}): Promise<RecognitionHandle> {
  const sdk = await import("microsoft-cognitiveservices-speech-sdk");
  const { token, region } = await getToken();

  const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(token, region);
  speechConfig.speechRecognitionLanguage = opts.lang || "ja-JP";

  const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
  const recognizer: SpeechRecognizer = new sdk.SpeechRecognizer(
    speechConfig,
    audioConfig
  );

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
    stop: () => {
      recognizer.stopContinuousRecognitionAsync(() => recognizer.close());
    },
  };
}

let activeSynth: SpeechSynthesizer | null = null;

/** 読み上げ中なら停止する。 */
export function stopSpeaking() {
  if (activeSynth) {
    try {
      activeSynth.close();
    } catch {
      /* noop */
    }
    activeSynth = null;
  }
}

/**
 * テキストを日本語 neural voice で読み上げる。
 * Markdown 記号は読み上げ前に軽く除去する。
 */
export async function speak(text: string, voice = "ja-JP-NanamiNeural"): Promise<void> {
  stopSpeaking();
  const clean = stripMarkdown(text);
  if (!clean.trim()) return;

  const sdk = await import("microsoft-cognitiveservices-speech-sdk");
  const { token, region } = await getToken();

  const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(token, region);
  speechConfig.speechSynthesisVoiceName = voice;

  const synth = new sdk.SpeechSynthesizer(speechConfig);
  activeSynth = synth;

  await new Promise<void>((resolve) => {
    synth.speakTextAsync(
      clean,
      () => {
        synth.close();
        if (activeSynth === synth) activeSynth = null;
        resolve();
      },
      () => {
        synth.close();
        if (activeSynth === synth) activeSynth = null;
        resolve();
      }
    );
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
    .slice(0, 1200); // 長文の読み上げ暴走を防ぐ
}

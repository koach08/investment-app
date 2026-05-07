/**
 * AIレスポンスのJSON先頭処理。
 *
 * 過去のassistant prefillパターンの名残で `"{" + rawOut` というハードコード
 * があちこちの API ルートに残っていた。AIが既に `{` から始める JSON を返すと
 * `{{...}}` になって parse 失敗 → rawText 生表示 → ユーザーには JSON ダンプ
 * が見えてしまう。
 *
 * このヘルパは「先頭が `{` または ` ``` ` で始まっているなら触らない、
 * そうでなければ `{` を補う」という挙動に統一する。
 */
export function normalizeAiJsonPrefix(rawOut: string): string {
  const trimmed = rawOut.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith("```")) {
    return rawOut;
  }
  return "{" + rawOut;
}

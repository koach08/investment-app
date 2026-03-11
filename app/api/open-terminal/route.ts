import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";

const TOOLS: Record<string, string> = {
  claude: "claude",
  codex: "codex",
};

export async function POST(req: NextRequest) {
  const { tool } = await req.json();

  const command = TOOLS[tool];
  if (!command) {
    return NextResponse.json(
      { error: `Unknown tool: ${tool}` },
      { status: 400 }
    );
  }

  const projectDir = process.cwd();

  const script = `
    tell application "Terminal"
      activate
      do script "cd ${projectDir.replace(/"/g, '\\"')} && ${command}"
    end tell
  `;

  return new Promise<NextResponse>((resolve) => {
    exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (error) => {
      if (error) {
        resolve(
          NextResponse.json(
            { error: "Failed to open terminal" },
            { status: 500 }
          )
        );
      } else {
        resolve(NextResponse.json({ ok: true }));
      }
    });
  });
}

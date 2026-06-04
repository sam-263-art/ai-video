import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: `你是一个AI视频生成提示词专家。将用户的简短描述扩展为详细的视频生成提示词。
要求：加入镜头语言、光影描述、画面质量词、风格描述。只输出扩展后的提示词，不要任何解释。

用户输入：${prompt}
扩展后：`,
          },
        ],
      }),
    });

    const data = await res.json();
    const enhanced = data.content?.[0]?.text?.trim() || prompt;

    return NextResponse.json({ enhanced });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { prompt, mode } = await req.json();

    // mode: "general"（原有通用增强）或 "manga_scene"（漫剧分镜扩写）
    const isManga = mode === "manga_scene";

    const systemPrompt = isManga
      ? `你是一位专业漫剧分镜导演。将用户输入的一句剧情描述，扩展为3个连续分镜的视频描述词。

要求：
- 输出3个分镜，用 ||| 分隔，不要编号，不要换行，不要解释
- 每个分镜描述包含：角色动作、镜头角度（如：特写/中景/全景/俯拍/仰拍）、光线氛围
- 保持角色外貌描述一致，每个分镜都要重复角色的外观特征
- 描述词用中文，简洁有画面感，40字以内一个分镜
- 分镜之间要有连续性，形成完整的一幕

示例输出格式：
女主角站在窗边，中景，夕阳逆光，红色长裙，神情若有所思|||镜头缓缓推近，女主角侧脸特写，泪光微闪，金色光晕环绕|||男主角出现在门口，全景，背光剪影，女主角转身，两人对视`
      : `你是一个AI视频生成提示词专家。将用户的简短描述扩展为详细的视频生成提示词。
要求：加入镜头语言、光影描述、画面质量词、风格描述。只输出扩展后的提示词，不要任何解释。`;

    const userContent = isManga
      ? `剧情描述：${prompt}\n\n请输出3个连续分镜描述词，用 ||| 分隔：`
      : `用户输入：${prompt}\n扩展后：`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userContent,
          },
        ],
      }),
    });

    const data = await res.json();
    const text = data.content?.[0]?.text?.trim() || prompt;

    if (isManga) {
      // 返回分镜数组
      const scenes = text
        .split("|||")
        .map((s: string) => s.trim())
        .filter(Boolean)
        .slice(0, 3);

      // 不足3条时用原始文本填充
      while (scenes.length < 3) scenes.push(prompt);

      return NextResponse.json({ scenes });
    }

    return NextResponse.json({ enhanced: text });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
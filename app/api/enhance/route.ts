import { NextResponse } from "next/server";

// DeepSeek uses an OpenAI-compatible API.
// Set DEEPSEEK_API_KEY in your .env.local
// Model: deepseek-chat = DeepSeek-V3 (fast, cheap, great at Chinese)
// Override via DEEPSEEK_MODEL env var if needed (e.g. deepseek-reasoner)
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

// ── Art style English mapping ──────────────────────────────────────────────
const STYLE_EN: Record<string, string> = {
  "日漫线稿": "Japanese anime style, clean line art, cel shading, vibrant colors, expressive eyes, manga aesthetic",
  "国风水墨": "Traditional Chinese ink wash painting style, elegant brushwork, muted tones, poetic misty atmosphere",
  "赛璐璐":   "Classic 90s anime cel animation, bold black outlines, flat color fills, retro aesthetic",
  "写实风":   "Cinematic photorealistic, film lighting, ultra-detailed textures, 8K quality, shallow depth of field",
  "古风仙侠": "Ancient Chinese fantasy xianxia style, flowing hanfu robes, mystical glowing effects, ethereal atmosphere",
  "都市恋爱": "Modern urban romance, soft bokeh background, warm golden hour lighting, contemporary cinematic drama",
  "3D渲染":   "3D CG rendered, Unreal Engine 5 quality, volumetric lighting, ray tracing, movie VFX quality",
};

/** Robustly extract the first JSON object from model output.
 *  Handles: markdown fences, preamble text, trailing text. */
function extractJson(raw: string): string {
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) return match[0];
  return raw
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      prompt, mode,
      script,    // for manga_storyboard
      panels,    // for manga_panel_prompts
      character, // for manga_panel_prompts
      style = "日漫线稿",
      genre = "都市言情",
    } = body;

    const styleDesc = STYLE_EN[style] ?? STYLE_EN["日漫线稿"];
    let systemPrompt = "";
    let userContent = "";
    let parseJson = false;
    let maxTokens = 1000;

    switch (mode) {

      // ── Original modes ──────────────────────────────────────────────────
      case "enhance":
      case "general":
        systemPrompt = `你是一个AI视频生成提示词专家。将用户的简短描述扩展为详细的视频生成提示词。
要求：加入镜头语言、光影描述、画面质量词、风格描述。只输出扩展后的提示词，不要任何解释。`;
        userContent = `用户输入：${prompt}\n扩展后：`;
        break;

      case "manga_scene":
        systemPrompt = `你是一位专业漫剧分镜导演。将用户输入的一句剧情描述，扩展为3个连续分镜的视频描述词。

要求：
- 输出3个分镜，用 ||| 分隔，不要编号，不要换行，不要解释
- 每个分镜描述包含：角色动作、镜头角度（如：特写/中景/全景/俯拍/仰拍）、光线氛围
- 保持角色外貌描述一致，每个分镜都要重复角色的外观特征
- 描述词用中文，简洁有画面感，40字以内一个分镜
- 分镜之间要有连续性，形成完整的一幕`;
        userContent = `剧情描述：${prompt}\n\n请输出3个连续分镜描述词，用 ||| 分隔：`;
        break;

      // ── New manga workflow modes ──────────────────────────────────────

      case "manga_script":
        parseJson = true;
        maxTokens = 2000;
        systemPrompt = `你是一位专业漫剧编剧。将用户的剧情创意，扩展为完整的漫剧剧本。

严格只输出合法JSON对象，不要任何解释、不要markdown符号、不要代码块标记：
{
  "title": "漫剧标题（6字以内）",
  "genre": "类型",
  "synopsis": "故事梗概（2-3句话）",
  "characters": [
    {
      "name": "角色名",
      "role": "主角/配角/反派",
      "appearance": "外貌描述（适合AI图片生成，50字以内：发型发色、服装风格、气质特征）"
    }
  ],
  "scenes": [
    {
      "index": 1,
      "title": "场景标题（8字以内）",
      "content": "该场景的详细剧情（4-6句话，描述动作、对话要点、情绪变化）"
    }
  ]
}

要求：
- 生成4-6个场景，保证完整故事弧（起→因→发展→高潮→转折→结局）
- 至少包含2个主要角色，角色外貌描述具体便于AI绘图
- 类型为${genre}，画风基调为${style}
- 剧情情感丰富，有张力`;
        userContent = `剧情创意："${prompt}"\n\n请生成完整漫剧剧本JSON：`;
        break;

      case "manga_storyboard": {
        parseJson = true;
        maxTokens = 3000;
        const scriptStr = typeof script === "string" ? script : JSON.stringify(script, null, 2);
        systemPrompt = `你是一位专业漫剧分镜导演。将剧本解析为详细的分镜脚本。

严格只输出合法JSON对象，不要任何解释、不要markdown符号、不要代码块标记：
{
  "panels": [
    {
      "index": 1,
      "title": "分镜标题（6字以内）",
      "sceneDescription": "画面内容详细描述（主体动作+情绪状态+关键视觉细节，40字以内）",
      "location": "场景地点（简洁，10字以内）",
      "camera": "镜头描述（景别+运镜方式，如：近景推镜/俯拍全景/双人中景跟拍）",
      "duration": 5,
      "transition": "转场方式（渐入/硬切/溶解/上推/叠化/旋转）",
      "dialog": "角色对白或旁白（无则留空字符串）",
      "mood": "情绪氛围（如：温馨/紧张/浪漫/悲伤/震撼）"
    }
  ]
}

分镜规范：
- 每个剧情场景生成2-3个分镜，共10-15个分镜
- 镜头语言要有变化（特写/中景/全景/俯仰拍交替）
- 时长3-8秒/分镜（关键情绪镜头可适当加长）
- 转场配合情绪节奏（激烈场景用硬切，温情场面用溶解）
- 画面描述要具体可视化，便于AI生成`;
        userContent = `剧本内容：\n${scriptStr}\n\n画风：${style}\n\n请生成详细分镜脚本JSON：`;
        break;
      }

      case "manga_panel_prompts":
        parseJson = true;
        maxTokens = 800;
        systemPrompt = `你是专业漫剧分镜提示词工程师，精通中英双语AI生成。根据分镜脚本生成提示词。

严格只输出合法JSON对象，不要任何解释、不要markdown符号：
{
  "characterPrompt": "（英文）角色在该分镜中的外观：姿势、表情、服装、动作",
  "scenePrompt": "（英文）背景环境：地点、光线、氛围、道具",
  "panelImagePrompt": "（英文）完整分镜图片生成提示词，结合角色+场景+构图，必须包含：${styleDesc}, high quality illustration",
  "videoPrompt": "（中文）视频生成提示词：描述画面动态、镜头运动、角色行为和情绪，包含${style}风格，流畅动画，电影质感。如有对白必须用中文写入。此字段必须全程用中文。"
}

规则：panelImagePrompt 英文输出（提升图片质量）；videoPrompt 必须中文输出（保证Vidu生成中文配音）。`;
        userContent = `分镜内容：\n${panels || prompt}\n\n主要角色：${character || "如分镜所述"}\n画风：${style}\n\n请生成提示词JSON：`;
        break;

      case "manga_character_prompt":
        parseJson = true;
        maxTokens = 600;
        systemPrompt = `You are an expert at writing prompts for AI character concept art generation.

Given a character description, generate detailed English prompts.
Output ONLY a valid JSON object (no markdown, no explanation, no code blocks):
{
  "imagePrompt": "Detailed character concept art prompt: pose (standing/front-facing for reference), appearance details, clothing, expression, style. Include: ${styleDesc}, character design sheet, clean background, high quality illustration",
  "consistencyKey": "A short 5-10 word phrase capturing the most distinctive visual features of this character"
}`;
        userContent = `Character: ${prompt}\nArt style: ${style}`;
        break;

      default:
        return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
    }

    // ── DeepSeek API call (OpenAI-compatible format) ─────────────────────
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY || ""}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userContent },
        ],
      }),
    });

    const data = await res.json();

    // ── Check for API-level errors ───────────────────────────────────────
    if (!res.ok || data.error) {
      const errMsg = data.error?.message || `DeepSeek API error ${res.status}`;
      console.error("[enhance] DeepSeek error:", errMsg, data);
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    // ── Extract text from OpenAI-compatible response ─────────────────────
    const rawText: string = data.choices?.[0]?.message?.content?.trim() ?? "";

    if (!rawText) {
      return NextResponse.json({ error: "AI未返回任何内容，请重试" }, { status: 500 });
    }

    // ── JSON modes ───────────────────────────────────────────────────────
    if (parseJson) {
      const cleaned = extractJson(rawText);
      try {
        return NextResponse.json(JSON.parse(cleaned));
      } catch {
        console.error("[enhance] JSON parse failed. Raw output:", rawText);
        return NextResponse.json({ error: "AI返回格式异常，请重试", raw: cleaned }, { status: 500 });
      }
    }

    // ── manga_scene: split by ||| ────────────────────────────────────────
    if (mode === "manga_scene") {
      const scenes = rawText
        .split("|||")
        .map((s: string) => s.trim())
        .filter(Boolean)
        .slice(0, 3);
      while (scenes.length < 3) scenes.push(prompt);
      return NextResponse.json({ scenes });
    }

    return NextResponse.json({ enhanced: rawText || prompt });

  } catch (error: any) {
    console.error("[enhance] Unexpected error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
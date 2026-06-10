import { NextResponse } from "next/server";

/**
 * /api/manga-image
 * POST { prompt: string, size?: "1024x1024" | "1024x1792" | "1792x1024" }
 *
 * Supported providers (configure via env vars):
 *   OPENAI_API_KEY       → DALL-E 3  (recommended for quality)
 *   SILICONFLOW_API_KEY  → Stable Diffusion via SiliconFlow (cost-effective, China-friendly)
 *
 * If neither key is set → returns an SVG placeholder with the prompt text.
 */

export async function POST(req: Request) {
  try {
    const { prompt, size = "1024x1024", character_prompts } = await req.json();
    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // 把角色文字描述注入到 prompt 开头，让图片生成模型优先参考角色外貌
    // character_prompts 来自 DeepSeek 为每个角色生成的英文描述，无需 Vision API
    const enhancedPrompt = Array.isArray(character_prompts) && character_prompts.length > 0
      ? `${character_prompts[0]}, ${prompt}`
      : prompt;

    // ── Provider: DALL-E 3 (OpenAI) ────────────────────────────────────
    if (process.env.OPENAI_API_KEY) {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: enhancedPrompt.slice(0, 4000),
          n: 1,
          size: size as "1024x1024" | "1024x1792" | "1792x1024",
          quality: "standard",
          response_format: "url",
        }),
      });
      const data = await res.json();
      if (data.error) {
        return NextResponse.json({ error: `DALL-E 3: ${data.error.message}` }, { status: 500 });
      }
      return NextResponse.json({ imageUrl: data.data?.[0]?.url, provider: "dalle3" });
    }

    // ── Provider: SiliconFlow (Stable Diffusion, popular in China) ──────
    if (process.env.SILICONFLOW_API_KEY) {
      const [w, h] = size.split("x").map(Number);
      const res = await fetch("https://api.siliconflow.cn/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "stabilityai/stable-diffusion-3-5-large",
          prompt: enhancedPrompt.slice(0, 2000),
          negative_prompt: "blurry, low quality, watermark, text, ugly, deformed",
          image_size: `${w}x${h}`,
          batch_size: 1,
          num_inference_steps: 20,
          guidance_scale: 7.5,
        }),
      });
      const data = await res.json();
      if (data.images?.[0]?.url) {
        return NextResponse.json({ imageUrl: data.images[0].url, provider: "siliconflow" });
      }
      return NextResponse.json(
        { error: `SiliconFlow: ${data.message || "生成失败"}` },
        { status: 500 }
      );
    }

    // ── Fallback: SVG placeholder ───────────────────────────────────────
    // Render the prompt text in a styled card so the workflow still shows
    // something useful even without an image API key configured.
    const lines = chunkText(prompt.slice(0, 200), 36);
    const textRows = lines
      .map((line, i) => `<text x="256" y="${215 + i * 22}" text-anchor="middle" fill="rgba(226,224,240,0.55)" font-size="13" font-family="'PingFang SC',sans-serif">${escXml(line)}</text>`)
      .join("\n");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#13131f"/>
      <stop offset="100%" stop-color="#0c0c1a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <rect x="1" y="1" width="510" height="510" rx="12" fill="none" stroke="rgba(168,85,247,0.2)" stroke-width="1.5"/>
  <text x="256" y="120" text-anchor="middle" font-size="56" font-family="sans-serif">🎨</text>
  <text x="256" y="165" text-anchor="middle" fill="#c084fc" font-size="14" font-weight="600" font-family="'PingFang SC',sans-serif">分镜图预览</text>
  <text x="256" y="185" text-anchor="middle" fill="rgba(255,255,255,0.2)" font-size="11" font-family="sans-serif">（配置 OPENAI_API_KEY 或 SILICONFLOW_API_KEY 以生成真实图片）</text>
  ${textRows}
  <text x="256" y="${215 + lines.length * 22 + 20}" text-anchor="middle" fill="rgba(168,85,247,0.4)" font-size="11" font-family="sans-serif">AI 将根据以上提示词生成分镜图</text>
</svg>`;

    const b64 = Buffer.from(svg).toString("base64");
    return NextResponse.json({
      imageUrl: `data:image/svg+xml;base64,${b64}`,
      provider: "placeholder",
      prompt,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function chunkText(text: string, maxLen: number): string[] {
  const words = text.split("");
  const lines: string[] = [];
  let current = "";
  for (const char of words) {
    current += char;
    if (current.length >= maxLen) { lines.push(current); current = ""; }
  }
  if (current) lines.push(current);
  return lines.slice(0, 6);
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
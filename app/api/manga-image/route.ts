import { NextResponse } from "next/server";

/**
 * /api/manga-image
 * POST { prompt, size?, character_prompts?, character_image? }
 *
 * 优先级：OPENAI_API_KEY → SILICONFLOW_API_KEY → SVG占位符
 *
 * 有 character_image 时走 SiliconFlow /v1/image2image（SDXL img2img）
 * 无 character_image 时走 /v1/images/generations（FLUX.2-pro 文字生成）
 */

export async function POST(req: Request) {
  try {
    const { prompt, size = "1024x1024", character_prompts, character_image } = await req.json();

    console.log("[manga-image] prompt长度:", prompt?.length);
    console.log("[manga-image] OPENAI_API_KEY:", !!process.env.OPENAI_API_KEY);
    console.log("[manga-image] SILICONFLOW_API_KEY:", !!process.env.SILICONFLOW_API_KEY);
    console.log("[manga-image] 有立绘图:", !!character_image);

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const enhancedPrompt = Array.isArray(character_prompts) && character_prompts.length > 0
      ? `${character_prompts[0]}, ${prompt}`
      : prompt;

    // ── DALL-E 3 ───────────────────────────────────────────────────────
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

    // ── SiliconFlow ────────────────────────────────────────────────────
    if (process.env.SILICONFLOW_API_KEY) {
      const [w, h] = size.split("x").map(Number);

      // 有立绘时：走 img2img 接口（SDXL），注入角色外貌
      // 无立绘时：走文字生成接口（FLUX.2-pro），质量更好
      if (character_image && typeof character_image === "string") {
        console.log("[manga-image] 走 img2img 路径 (SDXL)");

        const pureBase64 = character_image.replace(/^data:image\/\w+;base64,/, "");

        const res = await fetch("https://api.siliconflow.com/v1/image2image", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "stabilityai/stable-diffusion-xl-base-1.0",
            prompt: enhancedPrompt.slice(0, 2000),
            negative_prompt: "blurry, low quality, watermark, text, ugly, deformed, bad anatomy",
            image: pureBase64,
            strength: 0.65,
            image_size: `${w}x${h}`,
            batch_size: 1,
            num_inference_steps: 30,
            guidance_scale: 7.5,
          }),
        });

        console.log("[manga-image] img2img 响应状态:", res.status);
        const data = await res.json();
        console.log("[manga-image] img2img 响应:", JSON.stringify(data).slice(0, 300));

        if (data.images?.[0]?.url) {
          return NextResponse.json({ imageUrl: data.images[0].url, provider: "siliconflow-img2img" });
        }
        // img2img 失败时降级到文字生成，不直接报错
        console.warn("[manga-image] img2img 失败，降级到文字生成:", data.message || data.error);
      }

      // 文字生成：FLUX.2-pro
      console.log("[manga-image] 走文字生成路径 (FLUX.2-pro)");
      const res = await fetch("https://api.siliconflow.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "black-forest-labs/FLUX.2-pro",
          prompt: enhancedPrompt.slice(0, 2000),
          negative_prompt: "blurry, low quality, watermark, text, ugly, deformed",
          image_size: `${w}x${h}`,
          batch_size: 1,
          num_inference_steps: 20,
          guidance_scale: 7.5,
        }),
      });

      console.log("[manga-image] 文字生成响应状态:", res.status);
      const data = await res.json();
      console.log("[manga-image] 文字生成响应:", JSON.stringify(data).slice(0, 200));

      if (data.images?.[0]?.url) {
        return NextResponse.json({ imageUrl: data.images[0].url, provider: "siliconflow-flux" });
      }
      return NextResponse.json(
        { error: `SiliconFlow: ${data.message || data.error || "生成失败，请检查 API Key 和余额"}` },
        { status: 500 }
      );
    }

    // ── SVG 占位符 ─────────────────────────────────────────────────────
    console.log("[manga-image] 未找到任何 API Key，返回 SVG 占位符");
    const lines = chunkText(prompt.slice(0, 180), 34);
    const textRows = lines
      .map((line, i) => `<text x="256" y="${200 + i * 20}" text-anchor="middle" fill="rgba(226,224,240,0.5)" font-size="12" font-family="'PingFang SC',sans-serif">${escXml(line)}</text>`)
      .join("\n");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#13131f"/>
  <rect x="1" y="1" width="510" height="510" rx="12" fill="none" stroke="rgba(168,85,247,0.15)" stroke-width="1.5"/>
  <text x="256" y="80" text-anchor="middle" font-size="40" font-family="sans-serif">🎨</text>
  <text x="256" y="120" text-anchor="middle" fill="#c084fc" font-size="13" font-weight="600" font-family="'PingFang SC',sans-serif">分镜 Prompt 预览</text>
  <text x="256" y="165" text-anchor="middle" fill="rgba(255,255,255,0.15)" font-size="10" font-family="sans-serif">配置 SILICONFLOW_API_KEY 以生成真实图片</text>
  ${textRows}
  <text x="256" y="${200 + lines.length * 20 + 24}" text-anchor="middle" fill="rgba(168,85,247,0.35)" font-size="10" font-family="sans-serif">或上传角色立绘直接引用为分镜参考图</text>
</svg>`;

    const b64 = Buffer.from(svg).toString("base64");
    return NextResponse.json({ imageUrl: `data:image/svg+xml;base64,${b64}`, provider: "placeholder", prompt });

  } catch (error: any) {
    console.error("[manga-image] 未捕获错误:", error.message, error.stack);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function chunkText(text: string, maxLen: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const char of text.split("")) {
    current += char;
    if (current.length >= maxLen) { lines.push(current); current = ""; }
  }
  if (current) lines.push(current);
  return lines.slice(0, 6);
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
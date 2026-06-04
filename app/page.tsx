"use client";

import { useState, useRef } from "react";

type TaskStatus = "idle" | "creating" | "queueing" | "processing" | "success" | "failed";

interface HistoryItem {
  id: string;
  prompt: string;
  videoUrl: string;
  timestamp: string;
}

const PROMPT_TEMPLATES = [
  { label: "AI小姐姐", prompt: "一位美丽的AI少女，长发飘逸，穿着优雅，在樱花树下微笑，电影级光影，4K超清，浅景深" },
  { label: "萌宠视频", prompt: "一只可爱的橘猫在阳光照耀的草地上奔跑嬉戏，毛发细节清晰，慢镜头，温暖色调" },
  { label: "风景航拍", prompt: "无人机俯拍壮观山脉云海，晨曦光芒穿透云层，航拍视角，史诗级画面，超广角" },
  { label: "产品广告", prompt: "高端香水瓶在镜面台上旋转，水珠四溅，丁达尔光效，商业广告级别，极致细节" },
  { label: "科幻电影", prompt: "未来都市夜景，霓虹灯倒映在雨后街道，赛博朋克风格，飞行汽车穿梭，IMAX画质" },
  { label: "国风美女", prompt: "身着汉服的古典美女在竹林中漫步，水墨画风，薄雾缭绕，唯美意境" },
  { label: "汽车展示", prompt: "豪华跑车在山路上疾驰，车身反光细腻，运动镜头追拍，夕阳逆光，震撼视觉冲击" },
];

const MODES = [
  { value: "text2video", label: "文字生成视频", icon: "✦", desc: "通过描述词生成视频", needsImage: false },
  { value: "img2video",  label: "图片生成视频", icon: "⊞", desc: "以图片为首帧生成视频", needsImage: true },
  { value: "firstlast",  label: "首尾帧动画",   icon: "⇄", desc: "首尾两张图片过渡动画", needsImage: true },
  { value: "talking",    label: "人物说话",      icon: "◎", desc: "照片人物开口说话",     needsImage: true },
  { value: "product",    label: "产品展示",      icon: "◈", desc: "产品图片动态展示",     needsImage: true },
];

const CREDITS: Record<string, number> = { "540p": 9, "720p": 20, "1080p": 24 };

export default function Home() {
  const [activeNav, setActiveNav] = useState("generate");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState("540p");
  const [model, setModel] = useState("viduq3-pro");
  const [frameMode, setFrameMode] = useState("text2video");
  const [firstFrame, setFirstFrame] = useState<File | null>(null);
  const [firstFramePreview, setFirstFramePreview] = useState("");
  const [lastFrame, setLastFrame] = useState<File | null>(null);
  const [lastFramePreview, setLastFramePreview] = useState("");
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [modeBarOpen, setModeBarOpen] = useState(true);

  const [status, setStatus] = useState<TaskStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState("");
  const [currentTaskId, setCurrentTaskId] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [videoChain, setVideoChain] = useState<string[]>([]);
  const [isExtending, setIsExtending] = useState(false);

  const firstFrameRef = useRef<HTMLInputElement>(null);
  const lastFrameRef = useRef<HTMLInputElement>(null);

  const currentMode = MODES.find(m => m.value === frameMode)!;
  const needsImage = currentMode.needsImage;
  const estimatedCredits = duration * (CREDITS[resolution] ?? 9);
  const estimatedTime = duration <= 5 ? "1~2 分钟" : duration <= 10 ? "2~3 分钟" : "3~5 分钟";
  const isGenerating = ["creating", "queueing", "processing"].includes(status);
  const canGenerate = !isGenerating && prompt.trim() && (!needsImage || firstFrame);

  const statusLabel: Record<TaskStatus, string> = {
    idle: "", creating: "正在创建任务…", queueing: "排队等待中…",
    processing: `生成中 ${progress}%`, success: "生成完成", failed: "生成失败",
  };

  async function toBase64(file: File): Promise<string> {
    return new Promise((res) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width; canvas.height = img.height;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        res(canvas.toDataURL("image/jpeg", 0.95));
      };
      img.src = url;
    });
  }

  async function enhancePrompt() {
    if (!prompt.trim()) return;
    setIsEnhancing(true);
    try {
      const res = await fetch("/api/enhance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      const data = await res.json();
      if (data.enhanced) setPrompt(data.enhanced);
    } catch (e) { console.error(e); } finally { setIsEnhancing(false); }
  }

  function handleFirstFrame(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setFirstFrame(file); setFirstFramePreview(URL.createObjectURL(file));
  }
  function handleLastFrame(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setLastFrame(file); setLastFramePreview(URL.createObjectURL(file));
  }
  function clearFirstFrame() { setFirstFrame(null); setFirstFramePreview(""); if (firstFrameRef.current) firstFrameRef.current.value = ""; }
  function clearLastFrame() { setLastFrame(null); setLastFramePreview(""); if (lastFrameRef.current) lastFrameRef.current.value = ""; }

  async function generateVideo(extendFromUrl?: string) {
    if (!extendFromUrl && !prompt.trim()) return;
    setStatus("creating"); setProgress(0); setErrorMsg("");
    try {
	  const MODE_MAP: Record<string, number> = {
	  "text2video": 1, "img2video": 2, "firstlast": 3, "talking": 4, "product": 5, "extend": 6
	  };
	  const body: any = {
	  prompt: extendFromUrl ? prompt + "，继续上一个镜头，保持风格连贯" : prompt,
	  aspect_ratio: aspectRatio,
	  duration,
	  resolution,
	  t: MODE_MAP[extendFromUrl ? "extend" : frameMode],
	  };
      if (firstFrame && needsImage) body.first_frame = await toBase64(firstFrame);
      if (lastFrame && frameMode === "firstlast") body.last_frame = await toBase64(lastFrame);
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.error) { setStatus("failed"); setErrorMsg(data.error); return; }
      setCurrentTaskId(data.task_id);
      setStatus("queueing");
      pollTask(data.task_id, !!extendFromUrl);
    } catch (err: any) { setStatus("failed"); setErrorMsg(err.message); }
  }

  async function pollTask(id: string, isExtension = false) {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const res = await fetch(`/api/task/${id}`);
        const data = await res.json();
        if (data.progress) setProgress(Math.round(data.progress));
        if (data.state === "queueing") setStatus("queueing");
        if (data.state === "processing") setStatus("processing");
        if (data.state === "success") {
          const url = data.creations?.[0]?.url || data.creations?.[0]?.video_url || data.video_url || "";
          setVideoUrl(url); setStatus("success");
          if (isExtension) { setVideoChain(p => [...p, url]); setIsExtending(false); } else { setVideoChain([url]); }
          setHistory(p => [{ id: Date.now().toString(), prompt: prompt.slice(0, 40) + (prompt.length > 40 ? "…" : ""), videoUrl: url, timestamp: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) }, ...p.slice(0, 9)]);
          return;
        }
        if (data.state === "failed") { setStatus("failed"); setErrorMsg("视频生成失败"); setIsExtending(false); return; }
      } catch (e) { /* continue */ }
    }
    setStatus("failed"); setErrorMsg("生成超时，请重试"); setIsExtending(false);
  }

  async function extendVideo() {
    if (!videoUrl) return;
    setIsExtending(true);
    await generateVideo(videoUrl);
  }

  const NAV_ITEMS = [
    { id: "history",  icon: "⏱", label: "历史记录" },
  ];

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0c0c14", color: "#e2e0f0", fontFamily: "'SF Pro Display','PingFang SC',system-ui,sans-serif", overflow: "hidden" }}>

      {/* ── SIDEBAR NAV ── */}
      <div
        style={{
          width: modeBarOpen ? 220 : 56,
          borderRight: "1px solid rgba(255,255,255,0.05)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          transition: "width 0.25s",
          overflow: "hidden",
          background: "#0f0f18",
        }}
      >
        {/* Logo */}
        <div
          style={{
            height: 60,
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            gap: 10,
            borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: "linear-gradient(135deg,#6c5ce7,#a855f7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            ▶
          </div>

          {modeBarOpen && (
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              灵感之动
            </span>
          )}
        </div>

        {/* 折叠按钮 */}
        <button
          onClick={() => setModeBarOpen(!modeBarOpen)}
          style={{
            height: 40,
            border: "none",
            background: "transparent",
            color: "rgba(255,255,255,0.45)",
            cursor: "pointer",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: modeBarOpen ? "flex-end" : "center",
            paddingRight: modeBarOpen ? 12 : 0,
            width: "100%",
          }}
        >
          {modeBarOpen ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="14" height="14" rx="3" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2"/>
              <rect x="1" y="1" width="5" height="14" rx="3" fill="rgba(255,255,255,0.15)"/>
              <path d="M6.5 6L4.5 8L6.5 10" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="14" height="14" rx="3" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2"/>
              <rect x="1" y="1" width="5" height="14" rx="3" fill="rgba(255,255,255,0.15)"/>
              <path d="M4 6L6 8L4 10" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>

        {/* 生成模式 */}
        <div style={{ padding: 8 }}>
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => { setFrameMode(m.value); setActiveNav("generate"); }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 10,
                border: "none",
                marginBottom: 4,
                cursor: "pointer",
                transition: "all 0.15s",
                background:
                  frameMode === m.value
                    ? "rgba(168,85,247,0.14)"
                    : "transparent",
                color:
                  frameMode === m.value
                    ? "#c084fc"
                    : "rgba(255,255,255,0.55)",
              }}
            >
              <span
                style={{
                  width: 20,
                  textAlign: "center",
                  fontSize: 15,
                  flexShrink: 0,
                }}
              >
                {m.icon}
              </span>

              {modeBarOpen && (
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {m.label}
                  </div>

                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.25)",
                      marginTop: 2,
                    }}
                  >
                    {m.desc}
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* 原导航 */}
        <div
          style={{
            marginTop: "auto",
            padding: 8,
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          {NAV_ITEMS.map((n) => (
            <button
              key={n.id}
              onClick={() => setActiveNav(n.id)}
              style={{
                width: "100%",
                height: 40,
                borderRadius: 10,
                border: "none",
                marginBottom: 4,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "0 12px",
                background:
                  activeNav === n.id
                    ? "rgba(168,85,247,0.15)"
                    : "transparent",
                color:
                  activeNav === n.id
                    ? "#c084fc"
                    : "rgba(255,255,255,0.35)",
              }}
            >
              <span>{n.icon}</span>

              {modeBarOpen && (
                <span style={{ fontSize: 13 }}>
                  {n.label}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── LEFT PANEL ── */}
      <div style={{ width: 420, borderRight: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>

        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
            {activeNav === "history" ? "历史记录" : currentMode.label}
          </h2>
          {activeNav !== "history" && (
            <p style={{ margin: "3px 0 0", fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{currentMode.desc}</p>
          )}
        </div>

        {activeNav === "history" ? (
          /* ── HISTORY VIEW ── */
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {history.length === 0 ? (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", paddingTop: 60, fontSize: 13 }}>暂无历史记录</div>
            ) : history.map(item => (
              <div key={item.id} onClick={() => { setVideoUrl(item.videoUrl); setActiveNav("generate"); }}
                style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer", marginBottom: 6, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", transition: "all 0.15s" }}>
                <video src={item.videoUrl} style={{ width: 72, height: 48, objectFit: "cover", borderRadius: 7, flexShrink: 0 }} />
                <div style={{ overflow: "hidden" }}>
                  <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.7)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{item.prompt}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{item.timestamp}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ── GENERATE FORM ── */
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 0 }}>


            {/* Section: 参考图片 */}
            {needsImage && (
              <Section title={frameMode === "firstlast" ? "首尾帧图片" : "参考图片"}>
                <div style={{ display: "flex", gap: 10 }}>
                  {/* First Frame */}
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: "0 0 6px", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{frameMode === "firstlast" ? "首帧" : "图片"}</p>
                    {firstFramePreview ? (
                      <div style={{ position: "relative", borderRadius: 9, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <img src={firstFramePreview} alt="" style={{ width: "100%", display: "block", maxHeight: 120, objectFit: "cover" }} />
                        <button onClick={clearFirstFrame} style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                      </div>
                    ) : (
                      <div onClick={() => firstFrameRef.current?.click()} style={{ border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 9, height: 80, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", background: "rgba(255,255,255,0.02)" }}>
                        <span style={{ fontSize: 18, opacity: 0.25 }}>⊕</span>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>点击上传</span>
                      </div>
                    )}
                    <input ref={firstFrameRef} type="file" accept="image/*" onChange={handleFirstFrame} style={{ display: "none" }} />
                  </div>
                  {/* Last Frame */}
                  {frameMode === "firstlast" && (
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: "0 0 6px", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>尾帧</p>
                      {lastFramePreview ? (
                        <div style={{ position: "relative", borderRadius: 9, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
                          <img src={lastFramePreview} alt="" style={{ width: "100%", display: "block", maxHeight: 120, objectFit: "cover" }} />
                          <button onClick={clearLastFrame} style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                        </div>
                      ) : (
                        <div onClick={() => lastFrameRef.current?.click()} style={{ border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 9, height: 80, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", background: "rgba(255,255,255,0.02)" }}>
                          <span style={{ fontSize: 18, opacity: 0.25 }}>⊕</span>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>点击上传</span>
                        </div>
                      )}
                      <input ref={lastFrameRef} type="file" accept="image/*" onChange={handleLastFrame} style={{ display: "none" }} />
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Section: 描述词 */}
            <Section title="描述词">
              {/* Templates toggle */}
              <button onClick={() => setShowTemplates(p => !p)} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: "rgba(255,255,255,0.35)", fontSize: 12, cursor: "pointer", padding: "0 0 8px", marginLeft: -2 }}>
                <span style={{ fontSize: 10 }}>{showTemplates ? "▾" : "▸"}</span> 快速模板
              </button>
              {showTemplates && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                  {PROMPT_TEMPLATES.map(t => (
                    <button key={t.label} onClick={() => { setPrompt(t.prompt); setShowTemplates(false); }} style={{ padding: "3px 9px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer" }}>{t.label}</button>
                  ))}
                </div>
              )}
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="描述你想生成的视频内容…" disabled={isGenerating}
                style={{ width: "100%", height: 90, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9, padding: "10px 12px", color: "#e2e0f0", fontSize: 13, lineHeight: 1.6, resize: "none", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
              <button onClick={enhancePrompt} disabled={isEnhancing || !prompt.trim() || isGenerating}
                style={{ marginTop: 7, width: "100%", padding: "7px 0", borderRadius: 8, border: "1px solid rgba(168,85,247,0.25)", background: "rgba(168,85,247,0.07)", color: isEnhancing ? "rgba(255,255,255,0.25)" : "#c084fc", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>
                {isEnhancing ? "✦ AI 优化中…" : "✦ 一键增强 Prompt"}
              </button>
            </Section>

            {/* Section: 参数 */}
            <Section title="参数设置">
              {/* Aspect Ratio */}
              <div style={{ marginBottom: 14 }}>
                <p style={PL}>画面比例</p>
                <div style={{ display: "flex", gap: 5 }}>
                  {["16:9","4:3","1:1","9:16","3:4"].map(r => (
                    <button key={r} onClick={() => setAspectRatio(r)} style={{ flex: 1, padding: "5px 0", borderRadius: 7, border: `1px solid ${aspectRatio === r ? "rgba(168,85,247,0.6)" : "rgba(255,255,255,0.07)"}`, background: aspectRatio === r ? "rgba(168,85,247,0.12)" : "rgba(255,255,255,0.02)", color: aspectRatio === r ? "#c084fc" : "rgba(255,255,255,0.35)", fontSize: 11, cursor: "pointer" }}>{r}</button>
                  ))}
                </div>
              </div>
              {/* Duration */}
              <div style={{ marginBottom: 14 }}>
                <p style={PL}>时长 <span style={{ color: "#c084fc", fontWeight: 500 }}>{duration}s</span></p>
                <input type="range" min={1} max={15} step={1} value={duration} onChange={e => setDuration(Number(e.target.value))} style={{ width: "100%", accentColor: "#a855f7" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 2 }}>
                  <span>1s</span><span>8s</span><span>15s</span>
                </div>
              </div>
              {/* Resolution + Model */}
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <p style={PL}>分辨率</p>
                  <select value={resolution} onChange={e => setResolution(e.target.value)} style={SEL}>
                    <option value="540p">540p</option>
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={PL}>模型</p>
                  <select value={model} onChange={e => setModel(e.target.value)} style={SEL}>
                    <option value="viduq3-pro">Q3 Pro</option>
                    <option value="viduq2-turbo">Q2 Turbo</option>
                    <option value="vidu2.0">Vidu 2.0</option>
                  </select>
                </div>
              </div>
            </Section>

            {/* Cost */}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", borderRadius: 9, background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.12)", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>预计 {estimatedTime}</span>
              <span style={{ fontSize: 12, color: "#c084fc", fontWeight: 500 }}>{estimatedCredits} 积分</span>
            </div>
          </div>
        )}

        {/* Generate Button */}
        {activeNav === "generate" && (
          <div style={{ padding: "10px 18px 16px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            {needsImage && !firstFrame && <p style={{ margin: "0 0 6px", fontSize: 11, color: "#f87171", textAlign: "center" }}>请先上传参考图片</p>}
            {!prompt.trim() && <p style={{ margin: "0 0 6px", fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>请输入描述词</p>}
            <button onClick={() => generateVideo()} disabled={!canGenerate} style={{
              width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
              background: canGenerate ? "linear-gradient(135deg,#6c5ce7,#a855f7)" : "rgba(168,85,247,0.15)",
              color: canGenerate ? "#fff" : "rgba(255,255,255,0.3)",
              fontSize: 14, fontWeight: 600, cursor: canGenerate ? "pointer" : "not-allowed",
            }}>
              {isGenerating ? "生成中…" : `✦ 生成视频 · ${estimatedCredits} 积分`}
            </button>
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Status */}
        {status !== "idle" && (
          <div style={{ padding: "8px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.01)", flexShrink: 0 }}>
            {isGenerating && <div style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(168,85,247,0.2)", borderTopColor: "#a855f7", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />}
            <span style={{ fontSize: 13, color: status === "success" ? "#4ade80" : status === "failed" ? "#f87171" : "#c084fc" }}>
              {statusLabel[status]}{errorMsg && ` — ${errorMsg}`}
            </span>
            {status === "processing" && (
              <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.07)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${progress}%`, height: "100%", background: "linear-gradient(90deg,#6c5ce7,#a855f7)", transition: "width 0.5s", borderRadius: 4 }} />
              </div>
            )}
            {currentTaskId && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", marginLeft: "auto", flexShrink: 0 }}>#{currentTaskId.slice(-8)}</span>}
          </div>
        )}

        {/* Video Area */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, overflow: "auto" }}>
          {videoUrl ? (
            <div style={{ maxWidth: 720, width: "100%" }}>
              {videoChain.length > 1 && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>连续镜头 · {videoChain.length} 段</p>
                  <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4 }}>
                    {videoChain.map((url, i) => (
                      <div key={i} onClick={() => setVideoUrl(url)} style={{ flexShrink: 0, width: 90, borderRadius: 7, overflow: "hidden", cursor: "pointer", border: `1px solid ${videoUrl === url ? "rgba(168,85,247,0.7)" : "rgba(255,255,255,0.07)"}` }}>
                        <video src={url} style={{ width: "100%", height: 54, objectFit: "cover", display: "block" }} />
                        <div style={{ padding: "3px 6px", fontSize: 10, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>片段 {i + 1}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <video src={videoUrl} controls autoPlay style={{ width: "100%", borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)", background: "#000" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <a href={videoUrl} download="video.mp4" style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.25)", color: "#c084fc", fontSize: 12, fontWeight: 500, textDecoration: "none" }}>↓ 下载</a>
                <button onClick={extendVideo} disabled={isGenerating} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(74,222,128,0.25)", background: "rgba(74,222,128,0.08)", color: "#4ade80", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>↪ 续写 +{duration}s</button>
                <button onClick={() => { setVideoUrl(""); setStatus("idle"); setVideoChain([]); }} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)", background: "transparent", color: "rgba(255,255,255,0.3)", fontSize: 12, cursor: "pointer" }}>重新生成</button>
              </div>
            </div>
          ) : isGenerating ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", margin: "0 auto 12px", border: "2px solid rgba(168,85,247,0.15)", borderTopColor: "#a855f7", animation: "spin 1s linear infinite" }} />
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>{statusLabel[status]}</p>
            </div>
          ) : (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>▶</div>
              <p style={{ fontSize: 13 }}>在左侧配置参数，开始生成</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        textarea:focus { border-color: rgba(168,85,247,0.35) !important; }
        button:hover:not(:disabled) { opacity: 0.85; }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.25)", letterSpacing: "0.6px", textTransform: "uppercase" }}>{title}</p>
      {children}
    </div>
  );
}

const PL: React.CSSProperties = { margin: "0 0 6px", fontSize: 11, color: "rgba(255,255,255,0.3)" };
const SEL: React.CSSProperties = { width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)", background: "#13131f", color: "#e2e0f0", fontSize: 12, cursor: "pointer", appearance: "none", colorScheme: "dark" };

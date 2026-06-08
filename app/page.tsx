"use client";

import { useState, useRef, useEffect } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type TaskStatus = "idle" | "creating" | "queueing" | "processing" | "success" | "failed";

interface HistoryItem {
  id: string;
  prompt: string;
  videoUrl: string;
  timestamp: string;
}

interface CharacterCard {
  id: string;
  name: string;
  imageBase64: string;   // data URL
  styleDesc: string;     // 角色画风描述词前缀
}

interface MangaScene {
  id: string;
  prompt: string;
  status: TaskStatus;
  progress: number;
  videoUrl: string;
  errorMsg: string;
  taskId: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PROMPT_TEMPLATES = [
  { label: "AI小姐姐", prompt: "一位美丽的AI少女，长发飘逸，穿着优雅，在樱花树下微笑，电影级光影，浅景深" },
  { label: "萌宠视频", prompt: "一只可爱的橘猫在阳光照耀的草地上奔跑嬉戏，毛发细节清晰，慢镜头，温暖色调" },
  { label: "风景航拍", prompt: "无人机俯拍壮观山脉云海，晨曦光芒穿透云层，航拍视角，史诗级画面，超广角" },
  { label: "产品广告", prompt: "高端香水瓶在镜面台上旋转，水珠四溅，丁达尔光效，商业广告级别，极致细节" },
  { label: "科幻电影", prompt: "未来都市夜景，霓虹灯倒映在雨后街道，赛博朋克风格，飞行汽车穿梭，IMAX画质" },
  { label: "国风美女", prompt: "身着汉服的古典美女在竹林中漫步，水墨画风，薄雾缭绕，唯美意境" },
  { label: "汽车展示", prompt: "豪华跑车在山路上疾驰，车身反光细腻，运动镜头追拍，夕阳逆光，震撼视觉冲击" },
];

// 漫剧风格预设
const MANGA_STYLES = [
  { label: "日漫线稿", desc: "anime style, clean line art, cel shading, vibrant colors" },
  { label: "国风水墨", desc: "Chinese ink painting style, elegant brushwork, muted tones, poetic atmosphere" },
  { label: "赛璐璐", desc: "classic anime cel animation, bold outlines, flat colors, retro aesthetic" },
  { label: "写实风", desc: "cinematic realistic style, film lighting, detailed textures, 4K quality" },
  { label: "古风仙侠", desc: "ancient Chinese fantasy, flowing robes, mystical light effects, ethereal atmosphere" },
  { label: "都市恋爱", desc: "modern urban romance, soft lighting, warm tones, cinematic shallow depth of field" },
];

// 漫剧剧情模板
const MANGA_PLOT_TEMPLATES = [
  { label: "霸总初遇", plot: "霸道总裁在咖啡厅与平凡女主偶然相遇，眼神交汇，心动一刻" },
  { label: "古风重逢", plot: "离别多年的两人在繁华集市重逢，百感交集，欲言又止" },
  { label: "修仙突破", plot: "主角在山顶盘坐冥想，突然天地异象，成功突破瓶颈，灵气环绕" },
  { label: "校园告白", plot: "男主在操场夕阳下鼓起勇气向女主表白，女主羞涩转身" },
  { label: "对决时刻", plot: "两位高手在废墟中对峙，气氛剑拔弩张，决战即将开始" },
  { label: "温情日常", plot: "一对情侣在家做饭，笑声不断，阳光透过窗户洒进来" },
];

const MODES = [
  { value: "text2video", label: "文字生成视频", icon: "✦", desc: "通过描述词生成视频", needsImage: false },
  { value: "img2video",  label: "图片生成视频", icon: "⊞", desc: "以图片为首帧生成视频", needsImage: true },
  { value: "firstlast",  label: "首尾帧动画",   icon: "⇄", desc: "首尾两张图片过渡动画", needsImage: true },
  { value: "talking",    label: "人物说话",      icon: "◎", desc: "照片人物开口说话",     needsImage: true },
  { value: "product",    label: "产品展示",      icon: "◈", desc: "产品图片动态展示",     needsImage: true },
];

const CREDITS: Record<string, number> = { "540p": 9, "720p": 20, "1080p": 24 };

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Home() {
  // ── 普通模式 state ──
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

  // ── 漫剧模式 state ──
  const [isMangaMode, setIsMangaMode] = useState(false);
  const [mangaStep, setMangaStep] = useState(1);           // 1=剧情 2=角色 3=生成
  const [mangaPlot, setMangaPlot] = useState("");           // 用户输入的一句剧情
  const [mangaStyle, setMangaStyle] = useState(MANGA_STYLES[0]);
  const [mangaScenes, setMangaScenes] = useState<MangaScene[]>([]); // 分镜列表
  const [isExpandingPlot, setIsExpandingPlot] = useState(false);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [characters, setCharacters] = useState<CharacterCard[]>([]);
  const [showAddChar, setShowAddChar] = useState(false);
  const [newCharName, setNewCharName] = useState("");
  const [newCharStyle, setNewCharStyle] = useState("");
  const [newCharPreview, setNewCharPreview] = useState("");
  const [newCharBase64, setNewCharBase64] = useState("");
  const [mangaGenerating, setMangaGenerating] = useState(false);

  const firstFrameRef = useRef<HTMLInputElement>(null);
  const lastFrameRef = useRef<HTMLInputElement>(null);
  const charImageRef = useRef<HTMLInputElement>(null);

  // ── 普通模式计算 ──
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

  // ── 从 localStorage 加载角色库 ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem("manga_characters");
      if (saved) setCharacters(JSON.parse(saved));
    } catch {}
  }, []);

  function saveCharacters(chars: CharacterCard[]) {
    setCharacters(chars);
    try { localStorage.setItem("manga_characters", JSON.stringify(chars)); } catch {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 普通模式工具函数（保持原有逻辑不变）
  // ─────────────────────────────────────────────────────────────────────────

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
      const res = await fetch("/api/enhance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, mode: "enhance" }) });
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
        aspect_ratio: aspectRatio, duration, resolution,
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

  // ─────────────────────────────────────────────────────────────────────────
  // 漫剧模式函数
  // ─────────────────────────────────────────────────────────────────────────

  // Step1: 用 Claude 把一句剧情扩展为3个分镜描述词
  async function expandMangaPlot() {
    if (!mangaPlot.trim()) return;
    setIsExpandingPlot(true);
    try {
      const res = await fetch("/api/enhance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: mangaPlot, mode: "manga_scenes" }),
      });
      const data = await res.json();
      if (data.scenes && data.scenes.length > 0) {
        // 把分镜描述词加上角色一致性前缀和风格描述
        const char = characters.find(c => c.id === selectedCharId);
        const charPrefix = char ? `${char.styleDesc}，` : "";
        const stylePrefix = mangaStyle.desc + "，";
        const scenes: MangaScene[] = data.scenes.map((s: string, i: number) => ({
          id: `scene-${Date.now()}-${i}`,
          prompt: stylePrefix + charPrefix + s,
          status: "idle" as TaskStatus,
          progress: 0,
          videoUrl: "",
          errorMsg: "",
          taskId: "",
        }));
        setMangaScenes(scenes);
        setMangaStep(3);
      }
    } catch (e) { console.error(e); } finally { setIsExpandingPlot(false); }
  }

  // 手动添加一个空分镜
  function addManualScene() {
    setMangaScenes(prev => [...prev, {
      id: `scene-${Date.now()}`,
      prompt: "",
      status: "idle",
      progress: 0,
      videoUrl: "",
      errorMsg: "",
      taskId: "",
    }]);
  }

  // 删除分镜
  function removeScene(id: string) {
    setMangaScenes(prev => prev.filter(s => s.id !== id));
  }

  // 更新单条分镜 prompt
  function updateScenePrompt(id: string, val: string) {
    setMangaScenes(prev => prev.map(s => s.id === id ? { ...s, prompt: val } : s));
  }

  // 轮询单个漫剧分镜任务
  async function pollMangaScene(sceneId: string, taskId: string) {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const res = await fetch(`/api/task/${taskId}`);
        const data = await res.json();
        setMangaScenes(prev => prev.map(s => {
          if (s.id !== sceneId) return s;
          if (data.state === "success") {
            const url = data.creations?.[0]?.url || "";
            return { ...s, status: "success", videoUrl: url, progress: 100 };
          }
          if (data.state === "failed") return { ...s, status: "failed", errorMsg: "生成失败" };
          if (data.state === "processing") return { ...s, status: "processing", progress: Math.round(data.progress || 0) };
          if (data.state === "queueing") return { ...s, status: "queueing" };
          return s;
        }));
        const cur = (await (async () => {
          const r = await fetch(`/api/task/${taskId}`);
          return r.json();
        })());
        if (cur.state === "success" || cur.state === "failed") return;
      } catch {}
    }
    setMangaScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: "failed", errorMsg: "生成超时" } : s));
  }

  // 顺序生成所有分镜（串行，防止并发太多）
  async function generateAllScenes() {
    const char = characters.find(c => c.id === selectedCharId);
    setMangaGenerating(true);

    for (const scene of mangaScenes) {
      if (!scene.prompt.trim()) continue;
      // 标记为创建中
      setMangaScenes(prev => prev.map(s => s.id === scene.id ? { ...s, status: "creating", errorMsg: "" } : s));
      try {
        const body: any = {
          prompt: scene.prompt,
          aspect_ratio: "9:16",   // 漫剧默认竖屏
          duration: 5,
          resolution: "720p",
          t: char ? 2 : 1,         // 有角色图用 img2video，没有用 text2video
        };
        if (char) body.first_frame = char.imageBase64;

        const res = await fetch("/api/generate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.error) {
          setMangaScenes(prev => prev.map(s => s.id === scene.id ? { ...s, status: "failed", errorMsg: data.error } : s));
          continue;
        }
        setMangaScenes(prev => prev.map(s => s.id === scene.id ? { ...s, status: "queueing", taskId: data.task_id } : s));
        await pollMangaScene(scene.id, data.task_id);
      } catch (err: any) {
        setMangaScenes(prev => prev.map(s => s.id === scene.id ? { ...s, status: "failed", errorMsg: err.message } : s));
      }
    }
    setMangaGenerating(false);
  }

  // 重新生成单个分镜
  async function retryScene(sceneId: string) {
    const scene = mangaScenes.find(s => s.id === sceneId);
    if (!scene || !scene.prompt.trim()) return;
    const char = characters.find(c => c.id === selectedCharId);
    setMangaScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: "creating", errorMsg: "", videoUrl: "" } : s));
    try {
      const body: any = {
        prompt: scene.prompt, aspect_ratio: "9:16", duration: 5, resolution: "720p",
        t: char ? 2 : 1,
      };
      if (char) body.first_frame = char.imageBase64;
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.error) { setMangaScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: "failed", errorMsg: data.error } : s)); return; }
      setMangaScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: "queueing", taskId: data.task_id } : s));
      await pollMangaScene(sceneId, data.task_id);
    } catch (err: any) {
      setMangaScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: "failed", errorMsg: err.message } : s));
    }
  }

  // ── 角色库管理 ──
  async function handleCharImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const base64 = await toBase64(file);
    setNewCharBase64(base64);
    setNewCharPreview(URL.createObjectURL(file));
  }

  function saveNewChar() {
    if (!newCharName.trim() || !newCharBase64) return;
    const card: CharacterCard = {
      id: `char-${Date.now()}`,
      name: newCharName.trim(),
      imageBase64: newCharBase64,
      styleDesc: newCharStyle.trim() || `${newCharName}，保持角色外貌一致`,
    };
    saveCharacters([...characters, card]);
    setShowAddChar(false);
    setNewCharName(""); setNewCharStyle(""); setNewCharPreview(""); setNewCharBase64("");
    setSelectedCharId(card.id);
  }

  function deleteChar(id: string) {
    saveCharacters(characters.filter(c => c.id !== id));
    if (selectedCharId === id) setSelectedCharId(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────

  function sceneStatusColor(s: TaskStatus) {
    if (s === "success") return "#4ade80";
    if (s === "failed") return "#f87171";
    if (s === "idle") return "rgba(255,255,255,0.2)";
    return "#c084fc";
  }

  function sceneStatusLabel(scene: MangaScene) {
    if (scene.status === "idle") return "待生成";
    if (scene.status === "creating") return "创建中…";
    if (scene.status === "queueing") return "排队中…";
    if (scene.status === "processing") return `生成中 ${scene.progress}%`;
    if (scene.status === "success") return "完成";
    if (scene.status === "failed") return scene.errorMsg || "失败";
    return "";
  }

  const NAV_ITEMS = [{ id: "history", icon: "⏱", label: "历史记录" }];

  // ─────────────────────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0c0c14", color: "#e2e0f0", fontFamily: "'SF Pro Display','PingFang SC',system-ui,sans-serif", overflow: "hidden" }}>

      {/* ── SIDEBAR ── */}
      <div style={{ width: modeBarOpen ? 220 : 56, borderRight: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", flexShrink: 0, transition: "width 0.25s", overflow: "hidden", background: "#0f0f18" }}>

        {/* Logo */}
        <div style={{ height: 60, display: "flex", alignItems: "center", padding: "0 12px", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#6c5ce7,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>▶</div>
          {modeBarOpen && <span style={{ fontSize: 13, fontWeight: 600 }}>灵感之动</span>}
        </div>

        {/* 折叠按钮 */}
        <button onClick={() => setModeBarOpen(!modeBarOpen)} style={{ height: 40, border: "none", background: "transparent", color: "rgba(255,255,255,0.45)", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: modeBarOpen ? "flex-end" : "center", paddingRight: modeBarOpen ? 12 : 0, width: "100%" }}>
          {modeBarOpen ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="3" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2"/><rect x="1" y="1" width="5" height="14" rx="3" fill="rgba(255,255,255,0.15)"/><path d="M6.5 6L4.5 8L6.5 10" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="3" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2"/><rect x="1" y="1" width="5" height="14" rx="3" fill="rgba(255,255,255,0.15)"/><path d="M4 6L6 8L4 10" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
        </button>

        {/* ── 漫剧创作入口（置顶） ── */}
        <div style={{ padding: "8px 8px 4px" }}>
          <button
            onClick={() => { setIsMangaMode(true); setMangaStep(1); setActiveNav("manga"); }}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "none", marginBottom: 4, cursor: "pointer", transition: "all 0.15s",
              background: isMangaMode ? "rgba(250,197,117,0.18)" : "rgba(250,197,117,0.07)",
              color: isMangaMode ? "#fac775" : "rgba(250,197,117,0.6)",
            }}
          >
            <span style={{ width: 20, textAlign: "center", fontSize: 15, flexShrink: 0 }}>🎬</span>
            {modeBarOpen && (
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>漫剧创作</div>
                <div style={{ fontSize: 11, color: "rgba(250,197,117,0.5)", marginTop: 2 }}>AI一键生成漫剧</div>
              </div>
            )}
          </button>

          {modeBarOpen && <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "4px 4px 8px" }} />}
        </div>

        {/* 普通模式列表 */}
        <div style={{ padding: "0 8px", flex: 1, overflowY: "auto" }}>
          {MODES.map((m) => (
            <button key={m.value}
              onClick={() => { setFrameMode(m.value); setActiveNav("generate"); setIsMangaMode(false); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "none", marginBottom: 4, cursor: "pointer", transition: "all 0.15s", background: !isMangaMode && frameMode === m.value ? "rgba(168,85,247,0.14)" : "transparent", color: !isMangaMode && frameMode === m.value ? "#c084fc" : "rgba(255,255,255,0.55)" }}
            >
              <span style={{ width: 20, textAlign: "center", fontSize: 15, flexShrink: 0 }}>{m.icon}</span>
              {modeBarOpen && (
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>{m.desc}</div>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* 历史记录 */}
        <div style={{ marginTop: "auto", padding: 8, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          {NAV_ITEMS.map((n) => (
            <button key={n.id} onClick={() => { setActiveNav(n.id); setIsMangaMode(false); }}
              style={{ width: "100%", height: 40, borderRadius: 10, border: "none", marginBottom: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, padding: "0 12px", background: activeNav === n.id ? "rgba(168,85,247,0.15)" : "transparent", color: activeNav === n.id ? "#c084fc" : "rgba(255,255,255,0.35)" }}>
              <span>{n.icon}</span>
              {modeBarOpen && <span style={{ fontSize: 13 }}>{n.label}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          漫剧模式主界面
      ═══════════════════════════════════════════════════════════════════ */}
      {isMangaMode ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* 顶部标题栏 + 步骤指示器 */}
          <div style={{ padding: "0 24px", height: 60, borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 16, flexShrink: 0, background: "#0f0f18" }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: "#fac775" }}>🎬 漫剧创作</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 16 }}>
              {[{ n: 1, label: "剧情" }, { n: 2, label: "角色" }, { n: 3, label: "分镜" }].map(({ n, label }) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {n > 1 && <div style={{ width: 24, height: 1, background: mangaStep >= n ? "rgba(250,197,117,0.5)" : "rgba(255,255,255,0.1)" }} />}
                  <button onClick={() => setMangaStep(n)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500,
                      background: mangaStep === n ? "rgba(250,197,117,0.18)" : "transparent",
                      color: mangaStep >= n ? "#fac775" : "rgba(255,255,255,0.25)" }}>
                    <span style={{ width: 18, height: 18, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, background: mangaStep >= n ? "#fac775" : "rgba(255,255,255,0.1)", color: mangaStep >= n ? "#0c0c14" : "rgba(255,255,255,0.3)" }}>{n}</span>
                    {label}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 步骤内容 */}
          <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>

            {/* ── Step 1: 剧情输入 ── */}
            {mangaStep === 1 && (
              <div style={{ maxWidth: 640, margin: "0 auto" }}>
                <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 600 }}>第一步：输入剧情</h2>
                <p style={{ margin: "0 0 20px", fontSize: 13, color: "rgba(255,255,255,0.4)" }}>用一句话描述这集漫剧的剧情，AI 会自动拆分为多个分镜</p>

                {/* 风格选择 */}
                <div style={{ marginBottom: 20 }}>
                  <p style={PL}>选择漫剧风格</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {MANGA_STYLES.map(s => (
                      <button key={s.label} onClick={() => setMangaStyle(s)}
                        style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${mangaStyle.label === s.label ? "rgba(250,197,117,0.6)" : "rgba(255,255,255,0.08)"}`, background: mangaStyle.label === s.label ? "rgba(250,197,117,0.12)" : "rgba(255,255,255,0.02)", color: mangaStyle.label === s.label ? "#fac775" : "rgba(255,255,255,0.45)", fontSize: 12, cursor: "pointer" }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 剧情模板 */}
                <div style={{ marginBottom: 12 }}>
                  <p style={PL}>快速模板（点击填入）</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {MANGA_PLOT_TEMPLATES.map(t => (
                      <button key={t.label} onClick={() => setMangaPlot(t.plot)}
                        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.45)", fontSize: 11, cursor: "pointer" }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 剧情输入框 */}
                <textarea
                  value={mangaPlot}
                  onChange={e => setMangaPlot(e.target.value)}
                  placeholder="例如：霸道总裁在咖啡厅与平凡女主偶然相遇，眼神交汇，心动一刻…"
                  style={{ width: "100%", height: 100, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9, padding: "10px 12px", color: "#e2e0f0", fontSize: 13, lineHeight: 1.6, resize: "none", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                />

                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button onClick={expandMangaPlot} disabled={!mangaPlot.trim() || isExpandingPlot}
                    style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: mangaPlot.trim() ? "linear-gradient(135deg,#EF9F27,#fac775)" : "rgba(250,197,117,0.1)", color: mangaPlot.trim() ? "#0c0c14" : "rgba(255,255,255,0.2)", fontSize: 14, fontWeight: 600, cursor: mangaPlot.trim() ? "pointer" : "not-allowed" }}>
                    {isExpandingPlot ? "AI 拆分分镜中…" : "✦ AI 自动拆分分镜"}
                  </button>
                  <button onClick={() => setMangaStep(2)} style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>
                    跳过 →
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 2: 角色库 ── */}
            {mangaStep === 2 && (
              <div style={{ maxWidth: 640, margin: "0 auto" }}>
                <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 600 }}>第二步：选择角色</h2>
                <p style={{ margin: "0 0 20px", fontSize: 13, color: "rgba(255,255,255,0.4)" }}>上传主角参考图，生成视频时自动带入保持角色一致（可跳过）</p>

                {/* 已有角色卡 */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginBottom: 16 }}>
                  {/* 不使用角色 */}
                  <button onClick={() => setSelectedCharId(null)}
                    style={{ height: 130, borderRadius: 10, border: `1px solid ${selectedCharId === null ? "rgba(250,197,117,0.6)" : "rgba(255,255,255,0.08)"}`, background: selectedCharId === null ? "rgba(250,197,117,0.08)" : "rgba(255,255,255,0.02)", color: selectedCharId === null ? "#fac775" : "rgba(255,255,255,0.3)", fontSize: 12, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <span style={{ fontSize: 24, opacity: 0.5 }}>◎</span>
                    <span>纯文字生成</span>
                  </button>

                  {characters.map(char => (
                    <div key={char.id} style={{ position: "relative" }}>
                      <button onClick={() => setSelectedCharId(char.id)}
                        style={{ width: "100%", height: 130, borderRadius: 10, border: `1px solid ${selectedCharId === char.id ? "rgba(250,197,117,0.7)" : "rgba(255,255,255,0.08)"}`, overflow: "hidden", cursor: "pointer", padding: 0, background: "transparent", display: "block" }}>
                        <img src={char.imageBase64} alt={char.name} style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }} />
                        <div style={{ padding: "6px 8px", fontSize: 12, color: selectedCharId === char.id ? "#fac775" : "rgba(255,255,255,0.6)", textAlign: "center", background: "rgba(0,0,0,0.4)" }}>{char.name}</div>
                      </button>
                      <button onClick={() => deleteChar(char.id)}
                        style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.7)", color: "#f87171", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>×</button>
                    </div>
                  ))}

                  {/* 添加新角色 */}
                  <button onClick={() => setShowAddChar(true)}
                    style={{ height: 130, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.25)", fontSize: 12, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <span style={{ fontSize: 24, opacity: 0.4 }}>⊕</span>
                    <span>添加角色</span>
                  </button>
                </div>

                {/* 添加角色表单 */}
                {showAddChar && (
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
                    <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 500 }}>新建角色卡</p>
                    <div style={{ display: "flex", gap: 12 }}>
                      {/* 图片上传 */}
                      <div onClick={() => charImageRef.current?.click()}
                        style={{ width: 80, height: 80, borderRadius: 9, border: "1px dashed rgba(255,255,255,0.15)", cursor: "pointer", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {newCharPreview ? <img src={newCharPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 22, opacity: 0.3 }}>⊕</span>}
                      </div>
                      <input ref={charImageRef} type="file" accept="image/*" onChange={handleCharImage} style={{ display: "none" }} />
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                        <input value={newCharName} onChange={e => setNewCharName(e.target.value)} placeholder="角色名（如：林小晴）"
                          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 7, padding: "7px 10px", color: "#e2e0f0", fontSize: 12, outline: "none" }} />
                        <input value={newCharStyle} onChange={e => setNewCharStyle(e.target.value)} placeholder="外貌描述（如：黑色长发，白色校服）"
                          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 7, padding: "7px 10px", color: "#e2e0f0", fontSize: 12, outline: "none" }} />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button onClick={saveNewChar} disabled={!newCharName.trim() || !newCharBase64}
                        style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: newCharName.trim() && newCharBase64 ? "linear-gradient(135deg,#EF9F27,#fac775)" : "rgba(255,255,255,0.05)", color: newCharName.trim() && newCharBase64 ? "#0c0c14" : "rgba(255,255,255,0.2)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                        保存角色
                      </button>
                      <button onClick={() => setShowAddChar(false)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "rgba(255,255,255,0.3)", fontSize: 13, cursor: "pointer" }}>取消</button>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setMangaStep(1)} style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>← 上一步</button>
                  <button onClick={() => {
                    if (mangaScenes.length === 0) {
                      // 如果没有分镜，创建3个空的
                      const char = characters.find(c => c.id === selectedCharId);
                      const stylePrefix = mangaStyle.desc + "，";
                      const charPrefix = char ? `${char.styleDesc}，` : "";
                      setMangaScenes([1, 2, 3].map(i => ({ id: `scene-${Date.now()}-${i}`, prompt: stylePrefix + charPrefix, status: "idle" as TaskStatus, progress: 0, videoUrl: "", errorMsg: "", taskId: "" })));
                    }
                    setMangaStep(3);
                  }} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#EF9F27,#fac775)", color: "#0c0c14", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                    下一步：编辑分镜 →
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: 分镜板 + 生成 ── */}
            {mangaStep === 3 && (
              <div style={{ maxWidth: 900, margin: "0 auto" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div>
                    <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600 }}>第三步：分镜板</h2>
                    <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>确认每格分镜描述词，点击「一键生成全集」</p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={addManualScene} disabled={mangaGenerating}
                      style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 12, cursor: "pointer" }}>
                      + 添加分镜
                    </button>
                    <button onClick={generateAllScenes} disabled={mangaGenerating || mangaScenes.every(s => !s.prompt.trim())}
                      style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: !mangaGenerating ? "linear-gradient(135deg,#EF9F27,#fac775)" : "rgba(250,197,117,0.1)", color: !mangaGenerating ? "#0c0c14" : "rgba(255,255,255,0.2)", fontSize: 13, fontWeight: 600, cursor: mangaGenerating ? "not-allowed" : "pointer" }}>
                      {mangaGenerating ? "生成中…" : "▶ 一键生成全集"}
                    </button>
                  </div>
                </div>

                {/* 分镜格列表 */}
                {mangaScenes.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.2)", fontSize: 13 }}>
                    <p>还没有分镜，点击「← 上一步」输入剧情让 AI 自动生成，</p>
                    <p>或点击「+ 添加分镜」手动创建</p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
                    {mangaScenes.map((scene, idx) => (
                      <div key={scene.id} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${scene.status === "success" ? "rgba(74,222,128,0.25)" : scene.status === "failed" ? "rgba(248,113,113,0.25)" : "rgba(255,255,255,0.06)"}`, borderRadius: 12, overflow: "hidden" }}>

                        {/* 视频预览 or 占位 */}
                        <div style={{ height: 140, background: "#0c0c14", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {scene.videoUrl ? (
                            <video src={scene.videoUrl} controls style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          ) : scene.status !== "idle" ? (
                            <div style={{ textAlign: "center" }}>
                              {["creating","queueing","processing"].includes(scene.status) && (
                                <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(250,197,117,0.2)", borderTopColor: "#fac775", animation: "spin 0.8s linear infinite", margin: "0 auto 8px" }} />
                              )}
                              <span style={{ fontSize: 11, color: sceneStatusColor(scene.status) }}>{sceneStatusLabel(scene)}</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: 28, opacity: 0.1 }}>▶</span>
                          )}
                          {/* 分镜编号 */}
                          <span style={{ position: "absolute", top: 6, left: 8, fontSize: 10, color: "rgba(255,255,255,0.3)", background: "rgba(0,0,0,0.5)", padding: "2px 6px", borderRadius: 4 }}>分镜 {idx + 1}</span>
                          {/* 删除按钮 */}
                          <button onClick={() => removeScene(scene.id)} disabled={mangaGenerating}
                            style={{ position: "absolute", top: 5, right: 5, width: 18, height: 18, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "rgba(255,255,255,0.4)", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                        </div>

                        {/* 描述词编辑 */}
                        <div style={{ padding: "8px 10px" }}>
                          <textarea
                            value={scene.prompt}
                            onChange={e => updateScenePrompt(scene.id, e.target.value)}
                            disabled={mangaGenerating}
                            placeholder="描述这格分镜的画面内容…"
                            style={{ width: "100%", height: 60, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, padding: "6px 8px", color: "#e2e0f0", fontSize: 11, lineHeight: 1.5, resize: "none", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                          />
                          {/* 单格操作 */}
                          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                            {scene.status === "failed" && (
                              <button onClick={() => retryScene(scene.id)}
                                style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)", color: "#f87171", fontSize: 11, cursor: "pointer" }}>
                                重试
                              </button>
                            )}
                            {scene.status === "success" && scene.videoUrl && (
                              <a href={scene.videoUrl} download={`scene-${idx + 1}.mp4`}
                                style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: "1px solid rgba(74,222,128,0.25)", background: "rgba(74,222,128,0.06)", color: "#4ade80", fontSize: 11, textDecoration: "none", display: "block", textAlign: "center" }}>
                                ↓ 下载
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 进度汇总 */}
                {mangaScenes.length > 0 && (
                  <div style={{ marginTop: 20, padding: "10px 14px", borderRadius: 9, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: 16, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                    <span>共 {mangaScenes.length} 个分镜</span>
                    <span style={{ color: "#4ade80" }}>完成 {mangaScenes.filter(s => s.status === "success").length}</span>
                    <span style={{ color: "#c084fc" }}>生成中 {mangaScenes.filter(s => ["creating","queueing","processing"].includes(s.status)).length}</span>
                    <span style={{ color: "#f87171" }}>失败 {mangaScenes.filter(s => s.status === "failed").length}</span>
                    <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.25)" }}>提示：生成完成后可逐个下载视频片段</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      ) : (
        /* ═══════════════════════════════════════════════════════════════════
            普通模式（原有界面，完全保留）
        ═══════════════════════════════════════════════════════════════════ */
        <>
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
              <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                {history.length === 0 ? (
                  <div style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", paddingTop: 60, fontSize: 13 }}>暂无历史记录</div>
                ) : history.map(item => (
                  <div key={item.id} onClick={() => { setVideoUrl(item.videoUrl); setActiveNav("generate"); }}
                    style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer", marginBottom: 6, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}>
                    <video src={item.videoUrl} style={{ width: 72, height: 48, objectFit: "cover", borderRadius: 7, flexShrink: 0 }} />
                    <div style={{ overflow: "hidden" }}>
                      <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.7)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{item.prompt}</p>
                      <p style={{ margin: "4px 0 0", fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{item.timestamp}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 0 }}>

                {needsImage && (
                  <Section title={frameMode === "firstlast" ? "首尾帧图片" : "参考图片"}>
                    <div style={{ display: "flex", gap: 10 }}>
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

                <Section title="描述词">
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

                <Section title="参数设置">
                  <div style={{ marginBottom: 14 }}>
                    <p style={PL}>画面比例</p>
                    <div style={{ display: "flex", gap: 5 }}>
                      {["16:9","4:3","1:1","9:16","3:4"].map(r => (
                        <button key={r} onClick={() => setAspectRatio(r)} style={{ flex: 1, padding: "5px 0", borderRadius: 7, border: `1px solid ${aspectRatio === r ? "rgba(168,85,247,0.6)" : "rgba(255,255,255,0.07)"}`, background: aspectRatio === r ? "rgba(168,85,247,0.12)" : "rgba(255,255,255,0.02)", color: aspectRatio === r ? "#c084fc" : "rgba(255,255,255,0.35)", fontSize: 11, cursor: "pointer" }}>{r}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <p style={PL}>时长 <span style={{ color: "#c084fc", fontWeight: 500 }}>{duration}s</span></p>
                    <input type="range" min={1} max={15} step={1} value={duration} onChange={e => setDuration(Number(e.target.value))} style={{ width: "100%", accentColor: "#a855f7" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 2 }}>
                      <span>1s</span><span>8s</span><span>15s</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <p style={PL}>分辨率</p>
                      <select value={resolution} onChange={e => setResolution(e.target.value)} style={SEL}>
                        <option value="540p">540p</option><option value="720p">720p</option><option value="1080p">1080p</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={PL}>模型</p>
                      <select value={model} onChange={e => setModel(e.target.value)} style={SEL}>
                        <option value="viduq3-pro">Q3 Pro</option><option value="viduq2-turbo">Q2 Turbo</option><option value="vidu2.0">Vidu 2.0</option>
                      </select>
                    </div>
                  </div>
                </Section>

                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", borderRadius: 9, background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.12)", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>预计 {estimatedTime}</span>
                  <span style={{ fontSize: 12, color: "#c084fc", fontWeight: 500 }}>{estimatedCredits} 积分</span>
                </div>
              </div>
            )}

            {activeNav === "generate" && (
              <div style={{ padding: "10px 18px 16px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                {needsImage && !firstFrame && <p style={{ margin: "0 0 6px", fontSize: 11, color: "#f87171", textAlign: "center" }}>请先上传参考图片</p>}
                {!prompt.trim() && <p style={{ margin: "0 0 6px", fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>请输入描述词</p>}
                <button onClick={() => generateVideo()} disabled={!canGenerate} style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: canGenerate ? "linear-gradient(135deg,#6c5ce7,#a855f7)" : "rgba(168,85,247,0.15)", color: canGenerate ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 14, fontWeight: 600, cursor: canGenerate ? "pointer" : "not-allowed" }}>
                  {isGenerating ? "生成中…" : `✦ 生成视频 · ${estimatedCredits} 积分`}
                </button>
              </div>
            )}
          </div>

          {/* ── RIGHT PANEL ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
        </>
      )}

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

// ─── Sub-components ───────────────────────────────────────────────────────────

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
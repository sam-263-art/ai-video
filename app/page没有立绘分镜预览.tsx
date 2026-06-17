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

// Legacy – kept for backward compat
interface CharacterCard {
  id: string;
  name: string;
  imageBase64: string;
  styleDesc: string;
}

// ── New manga types ──

interface MangaScript {
  title: string;
  genre: string;
  synopsis: string;
  characters: { name: string; role: string; appearance: string }[];
  scenes: { index: number; title: string; content: string }[];
}

interface StoryboardPanel {
  id: string;
  index: number;
  title: string;
  sceneDescription: string;
  location: string;
  camera: string;
  duration: number;
  transition: string;
  dialog: string;
  mood: string;
  // AI-generated prompts
  characterPrompt: string;
  scenePrompt: string;
  panelImagePrompt: string;
  videoPrompt: string;
  // Generated assets
  panelImageUrl: string;
  videoUrl: string;
  // Status
  imageStatus: "idle" | "generating" | "done" | "error";
  videoStatus: TaskStatus;
  videoProgress: number;
  taskId: string;
  errorMsg: string;
}

interface CharacterAsset {
  prompt: string;
  consistencyKey: string;
  imageUrl: string;         // 立绘图（手动上传 or AI生成）
  triViewUrl: string;       // 三视图（手动上传 or AI生成）
  isGeneratingPrompt: boolean;
  isGeneratingImage: boolean;
  isGeneratingTriView: boolean;
  imageError: string;
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

const MANGA_STYLES = [
  { label: "日漫线稿", desc: "anime style, clean line art, cel shading, vibrant colors" },
  { label: "国风水墨", desc: "Chinese ink painting style, elegant brushwork, muted tones, poetic atmosphere" },
  { label: "赛璐璐",   desc: "classic anime cel animation, bold outlines, flat colors, retro aesthetic" },
  { label: "写实风",   desc: "cinematic realistic style, film lighting, detailed textures, 4K quality" },
  { label: "古风仙侠", desc: "ancient Chinese fantasy, flowing robes, mystical light effects, ethereal atmosphere" },
  { label: "都市恋爱", desc: "modern urban romance, soft lighting, warm tones, cinematic shallow depth of field" },
  { label: "3D渲染",   desc: "3D CG rendered, Unreal Engine 5 quality, volumetric lighting, movie quality" },
  { label: "3D动漫",  },
];

const MANGA_GENRES = ["都市言情", "古风仙侠", "校园青春", "奇幻冒险", "悬疑惊悚", "日常温情", "热血战斗"];

const MANGA_PLOT_TEMPLATES = [
  { label: "霸总初遇",  plot: "霸道总裁在咖啡厅与平凡女主偶然相遇，眼神交汇，心动一刻" },
  { label: "古风重逢",  plot: "离别多年的两人在繁华集市重逢，百感交集，欲言又止" },
  { label: "修仙突破",  plot: "主角在山顶盘坐冥想，突然天地异象，成功突破瓶颈，灵气环绕" },
  { label: "校园告白",  plot: "男主在操场夕阳下鼓起勇气向女主表白，女主羞涩转身" },
  { label: "对决时刻",  plot: "两位高手在废墟中对峙，气氛剑拔弩张，决战即将开始" },
  { label: "温情日常",  plot: "一对情侣在家做饭，笑声不断，阳光透过窗户洒进来" },
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
  // ── 普通模式 state ──────────────────────────────────────────────────────
  const [activeNav, setActiveNav]           = useState("generate");
  const [prompt, setPrompt]                 = useState("");
  const [aspectRatio, setAspectRatio]       = useState("16:9");
  const [duration, setDuration]             = useState(5);
  const [resolution, setResolution]         = useState("540p");
  const [model, setModel]                   = useState("viduq3-pro");
  const [frameMode, setFrameMode]           = useState("text2video");
  const [firstFrame, setFirstFrame]         = useState<File | null>(null);
  const [firstFramePreview, setFirstFramePreview] = useState("");
  const [lastFrame, setLastFrame]           = useState<File | null>(null);
  const [lastFramePreview, setLastFramePreview]   = useState("");
  const [isEnhancing, setIsEnhancing]       = useState(false);
  const [showTemplates, setShowTemplates]   = useState(false);
  const [modeBarOpen, setModeBarOpen]       = useState(true);
  const [status, setStatus]                 = useState<TaskStatus>("idle");
  const [progress, setProgress]             = useState(0);
  const [videoUrl, setVideoUrl]             = useState("");
  const [currentTaskId, setCurrentTaskId]   = useState("");
  const [history, setHistory]               = useState<HistoryItem[]>([]);
  const [errorMsg, setErrorMsg]             = useState("");
  const [videoChain, setVideoChain]         = useState<string[]>([]);
  const [isExtending, setIsExtending]       = useState(false);

  // ── 漫剧模式 state ──────────────────────────────────────────────────────
  const [isMangaMode, setIsMangaMode]       = useState(() => { try { return JSON.parse(localStorage.getItem("manga_isMangaMode") || "false"); } catch { return false; } });
  const [mangaStep, setMangaStep]           = useState(() => { try { return JSON.parse(localStorage.getItem("manga_step") || "1"); } catch { return 1; } });
  const [mangaStyle, setMangaStyle]         = useState(() => { try { return JSON.parse(localStorage.getItem("manga_style") || "null") || MANGA_STYLES[0]; } catch { return MANGA_STYLES[0]; } });
  const [mangaGenre, setMangaGenre]         = useState(() => { try { return localStorage.getItem("manga_genre") || "都市言情"; } catch { return "都市言情"; } });

  // Step 1 – Script
  const [mangaPlotInput, setMangaPlotInput]     = useState(() => { try { return localStorage.getItem("manga_plotInput") || ""; } catch { return ""; } });
  const [generatedScript, setGeneratedScript]   = useState<MangaScript | null>(() => { try { return JSON.parse(localStorage.getItem("manga_script") || "null"); } catch { return null; } });
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [scriptError, setScriptError]           = useState("");

  // Step 2 – Storyboard
  const [storyboardPanels, setStoryboardPanels]         = useState<StoryboardPanel[]>(() => { try { return JSON.parse(localStorage.getItem("manga_panels") || "[]"); } catch { return []; } });
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false);

  // Step 3 – Assets
  const [characterAssets, setCharacterAssets]   = useState<Record<string, CharacterAsset>>(() => { try { return JSON.parse(localStorage.getItem("manga_charAssets") || "{}"); } catch { return {}; } });
  const [isGeneratingAllImages, setIsGeneratingAllImages] = useState(false);
  const [uploadingCharName, setUploadingCharName] = useState<string | null>(null);
  const [uploadingCharField, setUploadingCharField] = useState<"portrait" | "triview">("portrait");
  const charUploadRef = useRef<HTMLInputElement>(null);

  // Step 4 – Video
  const [mangaGenerating, setMangaGenerating]   = useState(false);

  const firstFrameRef = useRef<HTMLInputElement>(null);
  const lastFrameRef  = useRef<HTMLInputElement>(null);

  // ★ 修复 stale closure：始终持有最新的 storyboardPanels
  const storyboardPanelsRef = useRef(storyboardPanels);
  useEffect(() => { storyboardPanelsRef.current = storyboardPanels; }, [storyboardPanels]);
  // ★ 同样缓存 characterAssets，generatePanelImage 异步过程中读最新值
  const characterAssetsRef = useRef(characterAssets);
  useEffect(() => { characterAssetsRef.current = characterAssets; }, [characterAssets]);

  // ★ localStorage 持久化：关键数据变化时写入
  useEffect(() => { try { localStorage.setItem("manga_isMangaMode", JSON.stringify(isMangaMode)); } catch {} }, [isMangaMode]);
  useEffect(() => { try { localStorage.setItem("manga_step", JSON.stringify(mangaStep)); } catch {} }, [mangaStep]);
  useEffect(() => { try { localStorage.setItem("manga_style", JSON.stringify(mangaStyle)); } catch {} }, [mangaStyle]);
  useEffect(() => { try { localStorage.setItem("manga_genre", mangaGenre); } catch {} }, [mangaGenre]);
  useEffect(() => { try { localStorage.setItem("manga_plotInput", mangaPlotInput); } catch {} }, [mangaPlotInput]);
  useEffect(() => { try { localStorage.setItem("manga_script", JSON.stringify(generatedScript)); } catch {} }, [generatedScript]);
  useEffect(() => { try { localStorage.setItem("manga_panels", JSON.stringify(storyboardPanels)); } catch {} }, [storyboardPanels]);
  useEffect(() => { try { localStorage.setItem("manga_charAssets", JSON.stringify(characterAssets)); } catch {} }, [characterAssets]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const currentMode    = MODES.find(m => m.value === frameMode)!;
  const needsImage     = currentMode.needsImage;
  const estimatedCredits = duration * (CREDITS[resolution] ?? 9);
  const estimatedTime  = duration <= 5 ? "1~2 分钟" : duration <= 10 ? "2~3 分钟" : "3~5 分钟";
  const isGenerating   = ["creating", "queueing", "processing"].includes(status);
  const canGenerate    = !isGenerating && prompt.trim() && (!needsImage || firstFrame);

  const statusLabel: Record<TaskStatus, string> = {
    idle: "", creating: "正在创建任务…", queueing: "排队等待中…",
    processing: `生成中 ${progress}%`, success: "生成完成", failed: "生成失败",
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 普通模式工具函数
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

  // ★ 辅助：把任意图片 URL（http/data:URL）转为 base64 data URL
  // Vidu img2video 接口只接受 base64，直接传 http URL 会静默失败
  async function urlToBase64(url: string): Promise<string | null> {
    try {
      if (url.startsWith("data:")) return url; // 已经是 base64
      const res = await fetch(url);
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result as string);
        reader.onerror = () => reject(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
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
  function clearLastFrame()  { setLastFrame(null); setLastFramePreview(""); if (lastFrameRef.current)  lastFrameRef.current.value = ""; }

  async function generateVideo(extendFromUrl?: string) {
    if (!extendFromUrl && !prompt.trim()) return;
    setStatus("creating"); setProgress(0); setErrorMsg("");
    try {
      const MODE_MAP: Record<string, number> = { text2video: 1, img2video: 2, firstlast: 3, talking: 4, product: 5, extend: 6 };
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
        const res  = await fetch(`/api/task/${id}`);
        const data = await res.json();
        if (data.progress) setProgress(Math.round(data.progress));
        if (data.state === "queueing")    setStatus("queueing");
        if (data.state === "processing")  setStatus("processing");
        if (data.state === "success") {
          const url = data.creations?.[0]?.url || "";
          setVideoUrl(url); setStatus("success");
          if (isExtension) { setVideoChain(p => [...p, url]); setIsExtending(false); }
          else             { setVideoChain([url]); }
          setHistory(p => [{ id: Date.now().toString(), prompt: prompt.slice(0, 40) + (prompt.length > 40 ? "…" : ""), videoUrl: url, timestamp: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) }, ...p.slice(0, 9)]);
          return;
        }
        if (data.state === "failed") { setStatus("failed"); setErrorMsg("视频生成失败"); setIsExtending(false); return; }
      } catch { /* continue */ }
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

  // Step 1: Generate full script
  async function generateScript() {
    if (!mangaPlotInput.trim()) return;
    setIsGeneratingScript(true);
    setScriptError("");
    try {
      const res = await fetch("/api/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: mangaPlotInput, mode: "manga_script", style: mangaStyle.label, genre: mangaGenre }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.title || !data.characters) throw new Error("AI返回格式异常，请重试");
      setGeneratedScript(data);
      // Init character assets
      const init: Record<string, CharacterAsset> = {};
      (data.characters || []).forEach((c: any) => {
        init[c.name] = { prompt: "", consistencyKey: "", imageUrl: "", triViewUrl: "", isGeneratingPrompt: false, isGeneratingImage: false, isGeneratingTriView: false, imageError: "" };
      });
      setCharacterAssets(init);
    } catch (e: any) {
      setScriptError(e.message);
    } finally {
      setIsGeneratingScript(false);
    }
  }

  // Step 2: Generate storyboard panels
  async function generateStoryboard() {
    if (!generatedScript) return;
    setIsGeneratingStoryboard(true);
    try {
      const res = await fetch("/api/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "manga_storyboard", script: generatedScript, style: mangaStyle.label }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const raw = data.panels || [];
      setStoryboardPanels(raw.map((p: any, i: number): StoryboardPanel => ({
        id: `panel-${Date.now()}-${i}`,
        index: p.index ?? i + 1,
        title: p.title ?? `分镜 ${i + 1}`,
        sceneDescription: p.sceneDescription ?? "",
        location: p.location ?? "",
        camera: p.camera ?? "",
        duration: p.duration ?? 5,
        transition: p.transition ?? "渐入",
        dialog: p.dialog ?? "",
        mood: p.mood ?? "",
        characterPrompt: "",
        scenePrompt: "",
        panelImagePrompt: "",
        videoPrompt: "",
        panelImageUrl: "",
        videoUrl: "",
        imageStatus: "idle",
        videoStatus: "idle",
        videoProgress: 0,
        taskId: "",
        errorMsg: "",
      })));
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsGeneratingStoryboard(false);
    }
  }

  function updatePanel(id: string, changes: Partial<StoryboardPanel>) {
    setStoryboardPanels(prev => prev.map(p => p.id === id ? { ...p, ...changes } : p));
  }

  // Step 3a: Generate character image prompt
  async function generateCharacterPrompt(charName: string) {
    const char = generatedScript?.characters.find(c => c.name === charName);
    if (!char) return;
    setCharacterAssets(prev => ({ ...prev, [charName]: { ...prev[charName], isGeneratingPrompt: true } }));
    try {
      const res = await fetch("/api/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: `${char.name}（${char.role}）：${char.appearance}`, mode: "manga_character_prompt", style: mangaStyle.label }),
      });
      const data = await res.json();
      setCharacterAssets(prev => ({ ...prev, [charName]: { ...prev[charName], prompt: data.imagePrompt || "", consistencyKey: data.consistencyKey || "", isGeneratingPrompt: false } }));
    } catch {
      setCharacterAssets(prev => ({ ...prev, [charName]: { ...prev[charName], isGeneratingPrompt: false } }));
    }
  }

  // Step 3b: Generate character illustration
  async function generateCharacterImage(charName: string) {
    const asset = characterAssets[charName];
    if (!asset?.prompt) return;
    setCharacterAssets(prev => ({ ...prev, [charName]: { ...prev[charName], isGeneratingImage: true, imageError: "" } }));
    try {
      const res = await fetch("/api/manga-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: asset.prompt }),
      });
      const data = await res.json();
      if (data.error) {
        // API 返回了错误，显示给用户
        setCharacterAssets(prev => ({ ...prev, [charName]: { ...prev[charName], isGeneratingImage: false, imageError: data.error } }));
        return;
      }
      if (!data.imageUrl) {
        setCharacterAssets(prev => ({ ...prev, [charName]: { ...prev[charName], isGeneratingImage: false, imageError: "未返回图片，请检查 API Key 配置" } }));
        return;
      }
      // 把 http URL 转为 base64 存储，避免跨域导致 <img> 无法显示
      const imageUrl = data.imageUrl;
      const base64Url = imageUrl.startsWith("data:") ? imageUrl : (await urlToBase64(imageUrl)) ?? imageUrl;
      setCharacterAssets(prev => ({ ...prev, [charName]: { ...prev[charName], imageUrl: base64Url, isGeneratingImage: false, imageError: "" } }));
    } catch (e: any) {
      setCharacterAssets(prev => ({ ...prev, [charName]: { ...prev[charName], isGeneratingImage: false, imageError: e.message || "网络请求失败，请重试" } }));
    }
  }

  // Step 3c: Generate image + video prompts for a panel
  async function generatePanelPrompts(panelId: string): Promise<void> {
    const panel = storyboardPanels.find(p => p.id === panelId);
    if (!panel) return;

    // ★ 修复：收集所有角色特征词，而不只取 characters[0]
    const allCharDesc = (generatedScript?.characters ?? [])
      .map(c => {
        const asset = characterAssets[c.name];
        // consistencyKey 是 AI 提炼的最简特征，如 "short black hair girl, red dress"
        return asset?.consistencyKey || asset?.prompt || c.appearance || "";
      })
      .filter(Boolean)
      .join("; ");

    // 主角描述单独传给 character 字段（DeepSeek 重点参考）
    const mainCharDesc = (() => {
      const c = generatedScript?.characters[0];
      if (!c) return "";
      const asset = characterAssets[c.name];
      return asset?.prompt || c.appearance || "";
    })();

    try {
      const res = await fetch("/api/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "manga_panel_prompts",
          panels: `Panel ${panel.index}: ${panel.title}\nScene: ${panel.sceneDescription}\nLocation: ${panel.location}\nCamera: ${panel.camera}\nMood: ${panel.mood}\nDialog: ${panel.dialog}`,
          character: mainCharDesc,
          style: mangaStyle.label,
        }),
      });
      const data = await res.json();

      // ★ 关键：把角色特征词硬编码到 videoPrompt 最前面
      // Vidu 每格都读到相同的角色描述，外貌漂移大幅降低
      const charAnchor = allCharDesc ? `保持角色外貌一致：${allCharDesc}，` : "";
      const rawVideoPrompt = data.videoPrompt || `${panel.sceneDescription}，${mangaStyle.desc}`;

      updatePanel(panelId, {
        characterPrompt:  data.characterPrompt  || "",
        scenePrompt:      data.scenePrompt      || "",
        panelImagePrompt: data.panelImagePrompt || `${panel.sceneDescription}, ${mangaStyle.desc}`,
        videoPrompt:      charAnchor + rawVideoPrompt,  // ★ 加角色锚点前缀
      });
    } catch {
      // fallback 时也加上角色描述词
      const charAnchor = allCharDesc ? `保持角色外貌一致：${allCharDesc}，` : "";
      updatePanel(panelId, {
        videoPrompt: charAnchor + `${panel.sceneDescription}，${mangaStyle.desc}，${panel.camera}`,
      });
    }
  }

  // Step 3d: Generate storyboard illustration for a single panel
  // 现阶段逻辑：
  //   ① 先确保 panelImagePrompt 已生成
  //   ② 检查是否有手动上传的角色立绘（任意一个角色）
  //      有立绘 → 把立绘图直接作为分镜参考图显示，imageStatus = "done"
  //              （等加了 API Key 后，这里改为把立绘传给 IP-Adapter 生成）
  //      无立绘 → 生成 prompt 预览卡（SVG 文字卡），提示用户配置 API Key
  async function generatePanelImage(panelId: string) {
    const panel = storyboardPanelsRef.current.find(p => p.id === panelId);
    if (!panel) return;

    // ① 确保 panelImagePrompt 已生成
    if (!panel.panelImagePrompt) {
      await generatePanelPrompts(panelId);
    }
    // await 之后用 ref 读最新值，避免 stale closure
    const freshPanel = storyboardPanelsRef.current.find(p => p.id === panelId);
    const imgPrompt = freshPanel?.panelImagePrompt || `${panel.sceneDescription}, ${mangaStyle.desc}`;

    // ② 读最新 characterAssets，找第一张有效立绘图
    const latestAssets = characterAssetsRef.current;
    let portraitUrl: string | null = null;
    const charTextPrompts: string[] = [];

    if (generatedScript?.characters) {
      for (const c of generatedScript.characters) {
        const asset = latestAssets[c.name];
        const desc = asset?.prompt || c.appearance;
        if (desc) charTextPrompts.push(desc);
        // 找第一张手动上传或 AI 生成的真实立绘（跳过 SVG 占位符）
        if (!portraitUrl && asset?.imageUrl && !asset.imageUrl.startsWith("data:image/svg")) {
          portraitUrl = asset.imageUrl;
        }
      }
    }

    updatePanel(panelId, { imageStatus: "generating" });

    // ③ 调用 /api/manga-image 生成分镜图
    //    有立绘时：通过 character_image 参数走 IP-Adapter/img2img，保持角色外貌一致
    //    无立绘时：纯文字生成，或无 API Key 时返回 SVG 占位符
    try {
      // 将立绘 URL 转为 base64（SiliconFlow img2img 只接受 base64）
      const portraitBase64 = portraitUrl ? await urlToBase64(portraitUrl) : null;

      const res = await fetch("/api/manga-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: imgPrompt,
          size: "1024x1792",
          character_prompts: charTextPrompts.length > 0 ? charTextPrompts : undefined,
          character_image: portraitBase64 ?? undefined,  // ★ 激活 IP-Adapter，注入角色外貌
        }),
      });
      const data = await res.json();
      if (data.error) {
        updatePanel(panelId, { imageStatus: "error", errorMsg: data.error });
        return;
      }
      // SVG 占位符也正常存储并显示（渲染层会区分真实图和占位）
      updatePanel(panelId, {
        panelImageUrl: data.imageUrl || "",
        imageStatus: data.imageUrl ? "done" : "error",
      });
    } catch (e: any) {
      updatePanel(panelId, { imageStatus: "error", errorMsg: e.message || "请求失败" });
    }
  }

  // Step 3 batch: Generate all panel images sequentially
  async function generateAllImages() {
    setIsGeneratingAllImages(true);
    for (const panel of storyboardPanels) {
      if (panel.imageStatus !== "done") {
        await generatePanelImage(panel.id);
        await new Promise(r => setTimeout(r, 300));
      }
    }
    setIsGeneratingAllImages(false);
  }

  // Step 4: Generate video for a single panel
  async function generatePanelVideo(panelId: string) {
    const panel = storyboardPanels.find(p => p.id === panelId);
    if (!panel) return;

    // 先确保 videoPrompt 已生成（含角色锚点）
    if (!panel.videoPrompt) {
      await generatePanelPrompts(panelId);
    }
    const freshPanel = storyboardPanels.find(p => p.id === panelId) || panel;

    // ★ 修复1：确保 videoPrompt 含角色描述词（双重保底）
    const allCharDesc = (generatedScript?.characters ?? [])
      .map(c => {
        const asset = characterAssets[c.name];
        return asset?.consistencyKey || c.appearance || "";
      })
      .filter(Boolean)
      .join("; ");

    const charAnchor = allCharDesc ? `保持角色外貌一致：${allCharDesc}，` : "";
    const finalVideoPrompt = freshPanel.videoPrompt?.startsWith("保持角色外貌一致")
      ? freshPanel.videoPrompt   // 已含锚点，不重复
      : charAnchor + (freshPanel.videoPrompt || `${freshPanel.sceneDescription}，${mangaStyle.desc}，${freshPanel.camera}`);

    updatePanel(panelId, { videoStatus: "creating", errorMsg: "" });

    try {
      // ★ 首帧策略：优先级 主角立绘 > 分镜参考图 > 纯文字生成
      //   每格视频首帧锁定为同一张主角立绘，角色外貌最稳定
      let frameBase64: string | null = null;

      // 1. 优先用主角（characters[0]）立绘，保证每格首帧一致
      const mainChar = generatedScript?.characters[0];
      const mainCharUrl = mainChar ? characterAssets[mainChar.name]?.imageUrl : null;
      if (mainCharUrl && !mainCharUrl.startsWith("data:image/svg")) {
        frameBase64 = await urlToBase64(mainCharUrl);
      }

      // 2. 主角无立绘时，用分镜参考图（IP-Adapter 已注入角色外貌，一致性次之）
      if (!frameBase64) {
        const panelImgUrl = freshPanel.panelImageUrl;
        if (panelImgUrl && !panelImgUrl.startsWith("data:image/svg")) {
          frameBase64 = await urlToBase64(panelImgUrl);
        }
      }

      // 3. 都没有时走纯文字生成（t=1），提示词锚点仍在起作用

      const hasImage = !!frameBase64;
      const body: any = {
        prompt: finalVideoPrompt,
        aspect_ratio: "9:16",
        duration: Math.min(Math.max(freshPanel.duration || 5, 3), 8),
        resolution: "720p",
        t: hasImage ? 2 : 1,
      };
      if (hasImage) body.first_frame = frameBase64;  // ★ 传 base64

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) { updatePanel(panelId, { videoStatus: "failed", errorMsg: data.error }); return; }
      updatePanel(panelId, { videoStatus: "queueing", taskId: data.task_id });
      await pollMangaPanelVideo(panelId, data.task_id);
    } catch (err: any) {
      updatePanel(panelId, { videoStatus: "failed", errorMsg: err.message });
    }
  }

  async function pollMangaPanelVideo(panelId: string, taskId: string) {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const res  = await fetch(`/api/task/${taskId}`);
        const data = await res.json();
        if (data.state === "success") {
          updatePanel(panelId, { videoStatus: "success", videoUrl: data.creations?.[0]?.url || "", videoProgress: 100 });
          return;
        }
        if (data.state === "failed") { updatePanel(panelId, { videoStatus: "failed", errorMsg: "生成失败" }); return; }
        if (data.state === "processing") updatePanel(panelId, { videoStatus: "processing", videoProgress: Math.round(data.progress || 0) });
        if (data.state === "queueing")   updatePanel(panelId, { videoStatus: "queueing" });
      } catch {}
    }
    updatePanel(panelId, { videoStatus: "failed", errorMsg: "生成超时" });
  }

  // Delete a storyboard panel
  function deletePanel(id: string) {
    setStoryboardPanels(prev => prev.filter(p => p.id !== id));
  }

  // Upload a local image as character portrait or tri-view
  function handleCharImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadingCharName) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setCharacterAssets(prev => ({
        ...prev,
        [uploadingCharName]: {
          ...prev[uploadingCharName],
          ...(uploadingCharField === "portrait" ? { imageUrl: dataUrl } : { triViewUrl: dataUrl }),
        },
      }));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
    setUploadingCharName(null);
  }

  // Step 4 batch: Generate all panel videos sequentially
  async function generateAllVideos() {
    setMangaGenerating(true);
    for (const panel of storyboardPanels) {
      if (panel.videoStatus !== "success") {
        await generatePanelVideo(panel.id);
      }
    }
    setMangaGenerating(false);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────

  function panelVideoLabel(p: StoryboardPanel) {
    if (p.videoStatus === "idle")       return "待生成";
    if (p.videoStatus === "creating")   return "创建中…";
    if (p.videoStatus === "queueing")   return "排队中…";
    if (p.videoStatus === "processing") return `生成中 ${p.videoProgress}%`;
    if (p.videoStatus === "success")    return "完成 ✓";
    if (p.videoStatus === "failed")     return p.errorMsg || "失败";
    return "";
  }

  function videoStatusColor(s: TaskStatus) {
    if (s === "success") return "#4ade80";
    if (s === "failed")  return "#f87171";
    if (s === "idle")    return "rgba(255,255,255,0.2)";
    return "#c084fc";
  }

  const doneCount    = storyboardPanels.filter(p => p.videoStatus === "success").length;
  const runningCount = storyboardPanels.filter(p => ["creating","queueing","processing"].includes(p.videoStatus)).length;
  const failCount    = storyboardPanels.filter(p => p.videoStatus === "failed").length;
  const imgDoneCount = storyboardPanels.filter(p => p.imageStatus === "done").length;

  const MANGA_STEPS = [
    { n: 1, label: "剧本生成", icon: "✍" },
    { n: 2, label: "智能分镜", icon: "🎞" },
    { n: 3, label: "角色画风", icon: "🎨" },
    { n: 4, label: "一键成片", icon: "▶" },
  ];

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

        {/* 漫剧创作入口 */}
        <div style={{ padding: "8px 8px 4px" }}>
          <button onClick={() => { setIsMangaMode(true); setActiveNav("manga"); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "none", marginBottom: 4, cursor: "pointer", transition: "all 0.15s", background: isMangaMode ? "rgba(250,197,117,0.18)" : "rgba(250,197,117,0.07)", color: isMangaMode ? "#fac775" : "rgba(250,197,117,0.6)" }}>
            <span style={{ width: 20, textAlign: "center", fontSize: 15, flexShrink: 0 }}>🎬</span>
            {modeBarOpen && (
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>漫剧创作</div>
                <div style={{ fontSize: 11, color: "rgba(250,197,117,0.5)", marginTop: 2 }}>AI全流程导演</div>
              </div>
            )}
          </button>
          {modeBarOpen && <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "4px 4px 8px" }} />}
        </div>

        {/* 普通模式列表 */}
        <div style={{ padding: "0 8px", flex: 1, overflowY: "auto" }}>
          {MODES.map((m) => (
            <button key={m.value} onClick={() => { setFrameMode(m.value); setActiveNav("generate"); setIsMangaMode(false); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "none", marginBottom: 4, cursor: "pointer", transition: "all 0.15s", background: !isMangaMode && frameMode === m.value ? "rgba(168,85,247,0.14)" : "transparent", color: !isMangaMode && frameMode === m.value ? "#c084fc" : "rgba(255,255,255,0.55)" }}>
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
          <button onClick={() => { setActiveNav("history"); setIsMangaMode(false); }}
            style={{ width: "100%", height: 40, borderRadius: 10, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, padding: "0 12px", background: activeNav === "history" ? "rgba(168,85,247,0.15)" : "transparent", color: activeNav === "history" ? "#c084fc" : "rgba(255,255,255,0.35)" }}>
            <span>⏱</span>
            {modeBarOpen && <span style={{ fontSize: 13 }}>历史记录</span>}
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          漫剧创作 — 4步全流程
      ═══════════════════════════════════════════════════════════════ */}
      {isMangaMode ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* ── 顶部步骤导航 ── */}
          <div style={{ height: 60, borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", padding: "0 24px", gap: 0, flexShrink: 0, background: "#0f0f18" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#fac775", marginRight: 24, flexShrink: 0 }}>🎬 漫剧创作</span>
            <div style={{ display: "flex", alignItems: "center", gap: 0, flex: 1 }}>
              {MANGA_STEPS.map(({ n, label, icon }, idx) => {
                const done   = mangaStep > n;
                const active = mangaStep === n;
                const locked = mangaStep < n && (n === 2 ? !generatedScript : n === 3 ? storyboardPanels.length === 0 : n === 4 ? storyboardPanels.length === 0 : false);
                return (
                  <div key={n} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    {idx > 0 && <div style={{ width: 32, height: 1, background: done ? "rgba(250,197,117,0.5)" : "rgba(255,255,255,0.08)", margin: "0 4px" }} />}
                    <button onClick={() => !locked && setMangaStep(n)} disabled={locked}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, border: active ? "1px solid rgba(250,197,117,0.4)" : "1px solid transparent", cursor: locked ? "not-allowed" : "pointer", background: active ? "rgba(250,197,117,0.12)" : done ? "rgba(250,197,117,0.06)" : "transparent", color: active ? "#fac775" : done ? "rgba(250,197,117,0.7)" : locked ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: active ? 600 : 400, transition: "all 0.15s" }}>
                      <span style={{ width: 18, height: 18, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: done ? 10 : 10, background: active ? "#fac775" : done ? "rgba(250,197,117,0.4)" : "rgba(255,255,255,0.07)", color: active ? "#0c0c14" : done ? "#fac775" : "inherit" }}>
                        {done ? "✓" : icon}
                      </span>
                      {label}
                    </button>
                  </div>
                );
              })}
            </div>
            {/* Style + Genre quick display */}
            <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 16, alignItems: "center" }}>
              <span style={{ padding: "3px 9px", borderRadius: 20, background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.2)", color: "#c084fc", fontSize: 11 }}>{mangaStyle.label}</span>
              <span style={{ padding: "3px 9px", borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{mangaGenre}</span>
              <button onClick={() => {
                if (!confirm("清除所有漫剧数据并重新开始？")) return;
                ["manga_isMangaMode","manga_step","manga_style","manga_genre","manga_plotInput","manga_script","manga_panels","manga_charAssets"].forEach(k => localStorage.removeItem(k));
                setGeneratedScript(null); setStoryboardPanels([]); setCharacterAssets({});
                setMangaPlotInput(""); setMangaStep(1); setScriptError("");
              }} style={{ padding: "3px 9px", borderRadius: 20, border: "1px solid rgba(248,113,113,0.25)", background: "rgba(248,113,113,0.06)", color: "rgba(248,113,113,0.6)", fontSize: 11, cursor: "pointer" }}>↺ 清除重置</button>
            </div>
          </div>

          {/* ── 步骤内容 ── */}
          <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>

            {/* ════════════════════════════════════
                STEP 1 — 剧本生成
            ════════════════════════════════════ */}
            {mangaStep === 1 && (
              <div style={{ maxWidth: 720, margin: "0 auto" }}>
                <div style={{ marginBottom: 28 }}>
                  <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>第一步：剧本生成</h2>
                  <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.35)" }}>输入一句剧情创意，自动扩写为完整剧本，包含人物关系、场景划分和情感弧线</p>
                </div>

                {/* 类型 + 画风 */}
                <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
                  <div style={{ flex: 1 }}>
                    <p style={PL}>漫剧类型</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {MANGA_GENRES.map(g => (
                        <button key={g} onClick={() => setMangaGenre(g)}
                          style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${mangaGenre === g ? "rgba(168,85,247,0.6)" : "rgba(255,255,255,0.08)"}`, background: mangaGenre === g ? "rgba(168,85,247,0.12)" : "rgba(255,255,255,0.02)", color: mangaGenre === g ? "#c084fc" : "rgba(255,255,255,0.45)", fontSize: 12, cursor: "pointer" }}>{g}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={PL}>画风风格</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {MANGA_STYLES.map(s => (
                        <button key={s.label} onClick={() => setMangaStyle(s)}
                          style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${mangaStyle.label === s.label ? "rgba(250,197,117,0.6)" : "rgba(255,255,255,0.08)"}`, background: mangaStyle.label === s.label ? "rgba(250,197,117,0.1)" : "rgba(255,255,255,0.02)", color: mangaStyle.label === s.label ? "#fac775" : "rgba(255,255,255,0.45)", fontSize: 12, cursor: "pointer" }}>{s.label}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 模板 */}
                <div style={{ marginBottom: 12 }}>
                  <p style={PL}>快速剧情模板</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {MANGA_PLOT_TEMPLATES.map(t => (
                      <button key={t.label} onClick={() => setMangaPlotInput(t.plot)}
                        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer" }}>{t.label}</button>
                    ))}
                  </div>
                </div>

                {/* 输入框 */}
                <textarea value={mangaPlotInput} onChange={e => setMangaPlotInput(e.target.value)}
                  placeholder={"用一句话描述漫剧的核心剧情…\n例如：霸道总裁在咖啡厅与平凡女主偶然相遇，眼神交汇，心动一刻"}
                  style={{ width: "100%", height: 110, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 14px", color: "#e2e0f0", fontSize: 13, lineHeight: 1.7, resize: "none", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />

                <button onClick={generateScript} disabled={!mangaPlotInput.trim() || isGeneratingScript}
                  style={{ width: "100%", marginTop: 12, padding: "13px 0", borderRadius: 10, border: "none", background: mangaPlotInput.trim() && !isGeneratingScript ? "linear-gradient(135deg,#EF9F27,#fac775)" : "rgba(250,197,117,0.1)", color: mangaPlotInput.trim() && !isGeneratingScript ? "#0c0c14" : "rgba(255,255,255,0.2)", fontSize: 14, fontWeight: 700, cursor: mangaPlotInput.trim() && !isGeneratingScript ? "pointer" : "not-allowed", letterSpacing: "0.3px" }}>
                  {isGeneratingScript ? "✦ AI 正在生成剧本…" : "✦ 一键生成剧本"}
                </button>

                {scriptError && <p style={{ marginTop: 8, color: "#f87171", fontSize: 12 }}>⚠ {scriptError}</p>}

                {/* ── 剧本预览 ── */}
                {generatedScript && (
                  <div style={{ marginTop: 24, borderRadius: 14, border: "1px solid rgba(250,197,117,0.2)", background: "rgba(250,197,117,0.04)", overflow: "hidden" }}>
                    {/* 标题行 */}
                    <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(250,197,117,0.1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "#fac775" }}>《{generatedScript.title}》</span>
                        <span style={{ marginLeft: 10, fontSize: 12, color: "rgba(250,197,117,0.5)", background: "rgba(250,197,117,0.1)", padding: "2px 8px", borderRadius: 20 }}>{generatedScript.genre}</span>
                      </div>
                      <button onClick={() => setMangaStep(2)}
                        style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#EF9F27,#fac775)", color: "#0c0c14", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        下一步：智能分镜 →
                      </button>
                    </div>

                    <div style={{ padding: "14px 18px" }}>
                      {/* 梗概 */}
                      <p style={{ margin: "0 0 14px", fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>{generatedScript.synopsis}</p>

                      {/* 角色 */}
                      <p style={PL}>主要角色</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                        {generatedScript.characters.map(c => (
                          <div key={c.name} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "8px 12px", minWidth: 160 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e0f0" }}>{c.name}</span>
                              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.06)", padding: "1px 6px", borderRadius: 10 }}>{c.role}</span>
                            </div>
                            <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>{c.appearance}</p>
                          </div>
                        ))}
                      </div>

                      {/* 场景列表 */}
                      <p style={PL}>场景划分（{generatedScript.scenes.length} 幕）</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {generatedScript.scenes.map(s => (
                          <div key={s.index} style={{ display: "flex", gap: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                            <span style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(250,197,117,0.15)", color: "#fac775", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s.index}</span>
                            <div>
                              <p style={{ margin: "0 0 3px", fontSize: 12, fontWeight: 600, color: "#e2e0f0" }}>{s.title}</p>
                              <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>{s.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ════════════════════════════════════
                STEP 2 — 智能分镜
            ════════════════════════════════════ */}
            {mangaStep === 2 && (
              <div style={{ maxWidth: 1000, margin: "0 auto" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 16 }}>
                  <div>
                    <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>第二步：智能分镜</h2>
                    <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.35)" }}>剧本拆解为逐格分镜脚本，包含场景、镜头、转场、时长和对白</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button onClick={() => setMangaStep(1)}
                      style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer" }}>← 剧本</button>
                    <button onClick={generateStoryboard} disabled={isGeneratingStoryboard || !generatedScript}
                      style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: !isGeneratingStoryboard ? "linear-gradient(135deg,#6c5ce7,#a855f7)" : "rgba(168,85,247,0.1)", color: !isGeneratingStoryboard ? "#fff" : "rgba(255,255,255,0.2)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      {isGeneratingStoryboard ? "AI 分镜中…" : storyboardPanels.length > 0 ? "↻ 重新分镜" : "✦ 智能分镜"}
                    </button>
                    {storyboardPanels.length > 0 && (
                      <button onClick={() => setMangaStep(3)}
                        style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#EF9F27,#fac775)", color: "#0c0c14", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        角色画风 →
                      </button>
                    )}
                  </div>
                </div>

                {/* 剧本摘要 */}
                {generatedScript && (
                  <div style={{ marginBottom: 20, padding: "10px 14px", borderRadius: 10, background: "rgba(250,197,117,0.05)", border: "1px solid rgba(250,197,117,0.12)", display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, color: "#fac775", fontWeight: 600 }}>《{generatedScript.title}》</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>{generatedScript.characters.map(c => c.name).join(" · ")}</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>{generatedScript.scenes.length} 幕剧情</span>
                    <span style={{ fontSize: 12, color: "rgba(168,85,247,0.7)" }}>{mangaStyle.label}</span>
                  </div>
                )}

                {isGeneratingStoryboard && (
                  <div style={{ textAlign: "center", padding: 60 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", border: "2px solid rgba(168,85,247,0.15)", borderTopColor: "#a855f7", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
                    <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>正在解析剧本，生成详细分镜脚本…</p>
                  </div>
                )}

                {storyboardPanels.length === 0 && !isGeneratingStoryboard && (
                  <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.15)", fontSize: 13 }}>
                    <p style={{ fontSize: 32, marginBottom: 10 }}>🎞</p>
                    <p>点击「智能分镜」，将剧本自动拆解为逐格分镜脚本</p>
                  </div>
                )}

                {/* 分镜网格 */}
                {storyboardPanels.length > 0 && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>共 {storyboardPanels.length} 个分镜，可直接编辑</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                      {storyboardPanels.map((panel, idx) => (
                        <div key={panel.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" }}>
                          {/* Panel header */}
                          <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <span style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(168,85,247,0.2)", color: "#c084fc", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>{idx + 1}</span>
                            <input value={panel.title} onChange={e => updatePanel(panel.id, { title: e.target.value })}
                              style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 12, fontWeight: 600, color: "#e2e0f0", fontFamily: "inherit" }} />
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>{panel.duration}s</span>
                          </div>

                          {/* Scene description */}
                          <div style={{ padding: "10px 12px" }}>
                            <textarea value={panel.sceneDescription} onChange={e => updatePanel(panel.id, { sceneDescription: e.target.value })}
                              placeholder="画面内容描述…"
                              style={{ width: "100%", height: 58, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, padding: "6px 8px", color: "#e2e0f0", fontSize: 11, lineHeight: 1.5, resize: "none", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />

                            {/* Meta row */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                              {[
                                { label: "场景", key: "location", val: panel.location },
                                { label: "镜头", key: "camera",   val: panel.camera },
                                { label: "转场", key: "transition", val: panel.transition },
                                { label: "情绪", key: "mood",     val: panel.mood },
                              ].map(({ label, key, val }) => (
                                <div key={key}>
                                  <p style={{ margin: "0 0 2px", fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</p>
                                  <input value={val} onChange={e => updatePanel(panel.id, { [key]: e.target.value } as any)}
                                    style={{ width: "100%", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 5, padding: "4px 7px", color: "rgba(255,255,255,0.6)", fontSize: 11, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                                </div>
                              ))}
                            </div>

                            {/* Duration */}
                            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                              <p style={{ margin: 0, fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0 }}>时长(s)</p>
                              <input type="number" min={3} max={8} value={panel.duration} onChange={e => updatePanel(panel.id, { duration: Number(e.target.value) })}
                                style={{ width: 48, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 5, padding: "4px 7px", color: "rgba(255,255,255,0.6)", fontSize: 11, outline: "none", fontFamily: "inherit" }} />
                              {panel.dialog && (
                                <span style={{ flex: 1, fontSize: 10, color: "rgba(255,255,255,0.25)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>💬 {panel.dialog}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ════════════════════════════════════
                STEP 3 — 角色与画风
            ════════════════════════════════════ */}
            {mangaStep === 3 && (
              <div style={{ maxWidth: 1000, margin: "0 auto" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 16 }}>
                  <div>
                    <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>第三步：角色与画风</h2>
                    <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.35)" }}>为每个角色生成一致性提示词和立绘图，并为每格分镜生成参考图</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button onClick={() => setMangaStep(2)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer" }}>← 分镜</button>
                    <button onClick={generateAllImages} disabled={isGeneratingAllImages}
                      style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: !isGeneratingAllImages ? "rgba(168,85,247,0.2)" : "rgba(168,85,247,0.05)", color: !isGeneratingAllImages ? "#c084fc" : "rgba(255,255,255,0.2)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      {isGeneratingAllImages ? "生成图片中…" : `⊞ 批量生成分镜图 (${imgDoneCount}/${storyboardPanels.length})`}
                    </button>
                    <button onClick={() => setMangaStep(4)} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#EF9F27,#fac775)", color: "#0c0c14", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>一键成片 →</button>
                  </div>
                </div>

                {/* Hidden file input for character image upload */}
                <input ref={charUploadRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleCharImageUpload} />

                {/* ── 角色区 ── */}
                {generatedScript?.characters && generatedScript.characters.length > 0 && (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <p style={{ ...PL, margin: 0, fontSize: 12 }}>角色设计 <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: "rgba(168,85,247,0.15)", color: "#c084fc", fontSize: 10, marginLeft: 4 }}>{generatedScript.characters.length}</span></p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {generatedScript.characters.map(char => {
                        const asset = characterAssets[char.name] || { prompt: "", consistencyKey: "", imageUrl: "", triViewUrl: "", isGeneratingPrompt: false, isGeneratingImage: false, isGeneratingTriView: false, imageError: "" };
                        return (
                          <div key={char.name} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden" }}>

                            {/* ── 卡片顶部：角色名 + 操作按钮 ── */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 14, fontWeight: 700 }}>{char.name}</span>
                                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: 10 }}>{char.role}</span>
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => generateCharacterPrompt(char.name)} disabled={asset.isGeneratingPrompt}
                                  style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(168,85,247,0.25)", background: "rgba(168,85,247,0.08)", color: "#c084fc", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                                  <span>✦</span>{asset.isGeneratingPrompt ? "生成中…" : "生成提示词"}
                                </button>
                                <button onClick={() => generateCharacterImage(char.name)} disabled={!asset.prompt || asset.isGeneratingImage}
                                  style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${asset.prompt ? "rgba(250,197,117,0.3)" : "rgba(255,255,255,0.06)"}`, background: asset.prompt ? "rgba(250,197,117,0.06)" : "transparent", color: asset.prompt ? "#fac775" : "rgba(255,255,255,0.2)", fontSize: 11, cursor: asset.prompt ? "pointer" : "not-allowed" }}>
                                  {asset.isGeneratingImage ? "生成中…" : "⊞ 生成立绘"}
                                </button>
                              </div>
                            </div>

                            {/* ── 卡片主体：左侧立绘 + 右侧信息 ── */}
                            <div style={{ display: "flex", gap: 0 }}>

                              {/* 立绘区（左侧大图） */}
                              <div style={{ width: 160, flexShrink: 0, position: "relative" }}>
                                {/* 标签 */}
                                <div style={{ position: "absolute", top: 8, left: 8, zIndex: 2, fontSize: 9, color: "rgba(255,255,255,0.5)", background: "rgba(0,0,0,0.5)", padding: "2px 7px", borderRadius: 4, letterSpacing: "0.5px" }}>立绘</div>
                                <div
                                  onClick={() => { setUploadingCharName(char.name); setUploadingCharField("portrait"); setTimeout(() => charUploadRef.current?.click(), 0); }}
                                  style={{ height: 200, background: "#0a0a14", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative", overflow: "hidden" }}
                                >
                                  {asset.imageUrl ? (
                                    <img src={asset.imageUrl} alt={`${char.name}立绘`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                                  ) : asset.isGeneratingImage ? (
                                    <div style={{ textAlign: "center" }}>
                                      <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(250,197,117,0.15)", borderTopColor: "#fac775", animation: "spin 0.8s linear infinite", margin: "0 auto 6px" }} />
                                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>生成中…</span>
                                    </div>
                                  ) : (
                                    <div style={{ textAlign: "center", color: "rgba(255,255,255,0.15)" }}>
                                      <div style={{ fontSize: 28, marginBottom: 6 }}>👤</div>
                                      <div style={{ fontSize: 10 }}>点击上传</div>
                                    </div>
                                  )}
                                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, opacity: 0, transition: "opacity 0.15s" }}
                                    onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                                    onMouseLeave={e => (e.currentTarget.style.opacity = "0")}>
                                    <span style={{ fontSize: 20 }}>📁</span>
                                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>上传立绘</span>
                                  </div>
                                </div>
                              </div>

                              {/* 右侧：角色信息 + 提示词 */}
                              <div style={{ flex: 1, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>

                                {/* 提示词展示框 */}
                                <div style={{ borderRadius: 8, background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.12)", padding: "8px 10px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(168,85,247,0.7)", textTransform: "uppercase", letterSpacing: "0.5px" }}>角色提示词</span>
                                    {asset.consistencyKey && (
                                      <button onClick={() => { setUploadingCharName(char.name); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#a855f7", fontSize: 12, lineHeight: 1 }} title="刷新">↻</button>
                                    )}
                                  </div>
                                  {asset.prompt ? (
                                    <div>
                                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginBottom: 3 }}>角色名: {char.name}</div>
                                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginBottom: 3 }}>性别: {char.role?.includes("女") || char.appearance?.includes("女") ? "女" : "男"}</div>
                                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginBottom: 6 }}>详细描述: {char.appearance.slice(0, 60)}{char.appearance.length > 60 ? "…" : ""}</div>
                                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginBottom: 3 }}>背景: 白底图</div>
                                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>画面风格: {mangaStyle.label}，带有艺术美感的设计图</div>
                                    </div>
                                  ) : (
                                    <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>点击「生成提示词」自动生成角色描述…</p>
                                  )}
                                </div>

                                {/* 三视图区域 */}
                                <div>
                                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 6, letterSpacing: "0.3px" }}>三视图</div>
                                  <div
                                    onClick={() => { setUploadingCharName(char.name); setUploadingCharField("triview"); setTimeout(() => charUploadRef.current?.click(), 0); }}
                                    style={{ borderRadius: 8, border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.01)", overflow: "hidden", cursor: "pointer", position: "relative", minHeight: 72 }}
                                  >
                                    {asset.triViewUrl ? (
                                      <div style={{ display: "flex", gap: 0, height: 90 }}>
                                        {/* 三视图主图 */}
                                        <img src={asset.triViewUrl} alt={`${char.name}三视图`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                                        {/* 替换按钮 */}
                                        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, opacity: 0, transition: "opacity 0.15s" }}
                                          onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                                          onMouseLeave={e => (e.currentTarget.style.opacity = "0")}>
                                          <span style={{ fontSize: 14 }}>📁</span>
                                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.8)" }}>替换三视图</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div style={{ height: 72, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                                        <span style={{ fontSize: 16, opacity: 0.3 }}>⊕</span>
                                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>上传三视图（正/侧/背）</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {asset.imageError && (
                                  <p style={{ margin: 0, fontSize: 10, color: "#f87171", lineHeight: 1.4, wordBreak: "break-word" }}>⚠ {asset.imageError}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── 分镜图区 ── */}
                <p style={{ ...PL, marginBottom: 10, fontSize: 12 }}>分镜参考图（{imgDoneCount}/{storyboardPanels.length} 已生成）</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                  {storyboardPanels.map((panel, idx) => {
                    const isSvgPlaceholder = panel.panelImageUrl?.startsWith("data:image/svg");
                    const hasRealImage = panel.panelImageUrl && !isSvgPlaceholder;
                    // 判断是否是直接引用的立绘图（非 API 生成）
                    const isPortraitRef = hasRealImage && panel.imageStatus === "done";
                    return (
                    <div key={panel.id} style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${panel.imageStatus === "done" ? (hasRealImage ? "rgba(250,197,117,0.35)" : "rgba(74,222,128,0.2)") : panel.imageStatus === "error" ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.06)"}`, background: "rgba(0,0,0,0.3)" }}>
                      {/* Image area */}
                      <div style={{ height: 130, background: "#0c0c14", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                        {hasRealImage ? (
                          // 真实图片（立绘引用 or API 生成）
                          <img src={panel.panelImageUrl} alt={panel.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : isSvgPlaceholder ? (
                          // SVG 占位符：显示 prompt 文字卡
                          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8px 10px", boxSizing: "border-box", background: "linear-gradient(135deg,#13131f,#0c0c1a)" }}>
                            <span style={{ fontSize: 18, marginBottom: 5 }}>🎨</span>
                            <p style={{ margin: 0, fontSize: 9, color: "rgba(226,224,240,0.45)", lineHeight: 1.4, textAlign: "center", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" as any }}>
                              {panel.panelImagePrompt || panel.sceneDescription}
                            </p>
                            <span style={{ marginTop: 5, fontSize: 8, color: "rgba(168,85,247,0.5)" }}>配置 API Key 后生成真实图片</span>
                          </div>
                        ) : panel.imageStatus === "generating" ? (
                          <div style={{ textAlign: "center" }}>
                            <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid rgba(250,197,117,0.15)", borderTopColor: "#fac775", animation: "spin 0.8s linear infinite", margin: "0 auto 6px" }} />
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>生成中…</span>
                          </div>
                        ) : panel.imageStatus === "error" ? (
                          <div style={{ textAlign: "center", padding: "0 10px" }}>
                            <span style={{ fontSize: 18 }}>⚠️</span>
                            <p style={{ margin: "4px 0 0", fontSize: 9, color: "#f87171", lineHeight: 1.4 }}>{panel.errorMsg || "生成失败"}</p>
                          </div>
                        ) : (
                          // idle：提示需要先上传立绘或配置 API Key
                          <div style={{ textAlign: "center", padding: "0 10px" }}>
                            <span style={{ fontSize: 22, opacity: 0.15 }}>🎨</span>
                            <p style={{ margin: "4px 0 0", fontSize: 9, color: "rgba(255,255,255,0.2)", lineHeight: 1.4 }}>上传立绘后点击生成</p>
                          </div>
                        )}

                        {/* 序号标签 */}
                        <span style={{ position: "absolute", top: 5, left: 7, fontSize: 9, background: "rgba(0,0,0,0.6)", color: "rgba(255,255,255,0.4)", padding: "2px 5px", borderRadius: 4 }}>{idx + 1}</span>

                        {/* 立绘引用徽标 */}
                        {isPortraitRef && (
                          <span style={{ position: "absolute", bottom: 5, left: 7, fontSize: 8, background: "rgba(250,197,117,0.2)", color: "#fac775", padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(250,197,117,0.3)" }}>
                            👤 立绘引用
                          </span>
                        )}

                        {/* 删除按钮 */}
                        <button onClick={() => deletePanel(panel.id)} disabled={isGeneratingAllImages}
                          style={{ position: "absolute", top: 5, right: 5, width: 20, height: 20, borderRadius: "50%", border: "none", background: "rgba(248,113,113,0.7)", color: "#fff", fontSize: 11, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                          title="删除此分镜">×</button>
                      </div>

                      {/* prompt 预览（hover 显示）*/}
                      {panel.panelImagePrompt && (
                        <div style={{ padding: "5px 9px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                          <p style={{ margin: 0, fontSize: 9, color: "rgba(255,255,255,0.25)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>
                            {panel.panelImagePrompt}
                          </p>
                        </div>
                      )}

                      {/* Title + button */}
                      <div style={{ padding: "6px 9px 8px" }}>
                        <p style={{ margin: "0 0 6px", fontSize: 11, color: "rgba(255,255,255,0.55)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{panel.title}</p>
                        <button onClick={() => generatePanelImage(panel.id)} disabled={panel.imageStatus === "generating" || isGeneratingAllImages}
                          style={{ width: "100%", padding: "5px 0", borderRadius: 6, border: `1px solid ${panel.imageStatus === "done" ? (hasRealImage ? "rgba(250,197,117,0.3)" : "rgba(74,222,128,0.25)") : "rgba(255,255,255,0.08)"}`, background: panel.imageStatus === "done" ? (hasRealImage ? "rgba(250,197,117,0.06)" : "rgba(74,222,128,0.06)") : "rgba(255,255,255,0.02)", color: panel.imageStatus === "done" ? (hasRealImage ? "#fac775" : "#4ade80") : "rgba(255,255,255,0.35)", fontSize: 10, cursor: "pointer" }}>
                          {panel.imageStatus === "done"
                            ? (hasRealImage ? "👤 已引用立绘  重新生成" : "✓ 已完成  重新生成")
                            : panel.imageStatus === "generating" ? "生成中…"
                            : panel.imageStatus === "error" ? "⚠ 重试"
                            : "⊞ 生成分镜图"}
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ════════════════════════════════════
                STEP 4 — 一键成片
            ════════════════════════════════════ */}
            {mangaStep === 4 && (
              <div style={{ maxWidth: 1100, margin: "0 auto" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 16 }}>
                  <div>
                    <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>第四步：一键成片</h2>
                    <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.35)" }}>AI 为每个分镜生成视频，竖屏 9:16 · 540p · 逐格生成</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    <button onClick={() => setMangaStep(3)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer" }}>← 角色画风</button>
                    <button onClick={generateAllVideos} disabled={mangaGenerating || storyboardPanels.every(p => !p.sceneDescription.trim())}
                      style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: !mangaGenerating ? "linear-gradient(135deg,#EF9F27,#fac775)" : "rgba(250,197,117,0.1)", color: !mangaGenerating ? "#0c0c14" : "rgba(255,255,255,0.2)", fontSize: 14, fontWeight: 700, cursor: mangaGenerating ? "not-allowed" : "pointer", letterSpacing: "0.3px" }}>
                      {mangaGenerating ? "▶ 生成中…" : "▶ 一键生成全集"}
                    </button>
                  </div>
                </div>

                {/* 进度统计 */}
                <div style={{ marginBottom: 20, padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: 20, flexWrap: "wrap", fontSize: 12 }}>
                  <span style={{ color: "rgba(255,255,255,0.3)" }}>共 {storyboardPanels.length} 格分镜</span>
                  <span style={{ color: "#4ade80" }}>✓ 完成 {doneCount}</span>
                  {runningCount > 0 && <span style={{ color: "#c084fc" }}>⟳ 生成中 {runningCount}</span>}
                  {failCount   > 0 && <span style={{ color: "#f87171" }}>✕ 失败 {failCount}</span>}
                  <span style={{ color: "rgba(255,255,255,0.15)", marginLeft: "auto" }}>
                    {doneCount === storyboardPanels.length && storyboardPanels.length > 0 ? "🎉 全部完成，可逐个下载视频片段" : "每格依次生成，请耐心等待"}
                  </span>
                </div>

                {/* 分镜视频格 */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
                  {storyboardPanels.map((panel, idx) => (
                    <div key={panel.id} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${panel.videoStatus === "success" ? "rgba(74,222,128,0.25)" : panel.videoStatus === "failed" ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.06)"}`, borderRadius: 12, overflow: "hidden" }}>

                      {/* Video / Image / Placeholder */}
                      <div style={{ height: 160, background: "#080810", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                        {panel.videoUrl ? (
                          <video src={panel.videoUrl} controls style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : panel.panelImageUrl ? (
                          <img src={panel.panelImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.5 }} />
                        ) : (
                          <span style={{ fontSize: 32, opacity: 0.06 }}>▶</span>
                        )}
                        {/* Status overlay */}
                        {panel.videoStatus !== "idle" && panel.videoStatus !== "success" && (
                          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", gap: 8 }}>
                            {["creating","queueing","processing"].includes(panel.videoStatus) && (
                              <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(192,132,252,0.2)", borderTopColor: "#c084fc", animation: "spin 0.8s linear infinite" }} />
                            )}
                            <span style={{ fontSize: 11, color: videoStatusColor(panel.videoStatus) }}>{panelVideoLabel(panel)}</span>
                            {panel.videoStatus === "processing" && (
                              <div style={{ width: 100, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 4 }}>
                                <div style={{ width: `${panel.videoProgress}%`, height: "100%", background: "#c084fc", borderRadius: 4, transition: "width 0.5s" }} />
                              </div>
                            )}
                          </div>
                        )}
                        <span style={{ position: "absolute", top: 6, left: 8, fontSize: 10, background: "rgba(0,0,0,0.7)", color: "rgba(255,255,255,0.4)", padding: "2px 6px", borderRadius: 4 }}>
                          {idx + 1} · {panel.title}
                        </span>
                        {panel.videoStatus === "success" ? (
                          <span style={{ position: "absolute", top: 6, right: 8, fontSize: 10, background: "rgba(74,222,128,0.15)", color: "#4ade80", padding: "2px 6px", borderRadius: 4 }}>✓ 完成</span>
                        ) : (
                          <button onClick={() => deletePanel(panel.id)} disabled={mangaGenerating}
                            style={{ position: "absolute", top: 6, right: 8, width: 20, height: 20, borderRadius: "50%", border: "none", background: "rgba(248,113,113,0.7)", color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                            title="删除此分镜">×</button>
                        )}
                      </div>

                      {/* Scene info */}
                      <div style={{ padding: "8px 10px" }}>
                        <p style={{ margin: "0 0 6px", fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {panel.sceneDescription || "—"}
                        </p>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 7 }}>
                          {panel.location && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)", padding: "1px 6px", borderRadius: 4 }}>{panel.location}</span>}
                          {panel.camera &&   <span style={{ fontSize: 10, color: "rgba(168,85,247,0.5)", background: "rgba(168,85,247,0.06)", padding: "1px 6px", borderRadius: 4 }}>{panel.camera}</span>}
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.04)", padding: "1px 6px", borderRadius: 4 }}>{panel.duration}s</span>
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: "flex", gap: 5 }}>
                          {panel.videoStatus === "failed" ? (
                            <button onClick={() => generatePanelVideo(panel.id)} style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.07)", color: "#f87171", fontSize: 11, cursor: "pointer" }}>重试</button>
                          ) : panel.videoStatus !== "success" ? (
                            <button onClick={() => generatePanelVideo(panel.id)} disabled={mangaGenerating || ["creating","queueing","processing"].includes(panel.videoStatus)}
                              style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: "1px solid rgba(250,197,117,0.2)", background: "rgba(250,197,117,0.05)", color: "rgba(250,197,117,0.7)", fontSize: 11, cursor: "pointer" }}>生成视频</button>
                          ) : (
                            <a href={panel.videoUrl} download={`scene-${String(idx + 1).padStart(2, "0")}.mp4`}
                              style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: "1px solid rgba(74,222,128,0.25)", background: "rgba(74,222,128,0.06)", color: "#4ade80", fontSize: 11, textDecoration: "none", display: "block", textAlign: "center" }}>↓ 下载</a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* All done banner */}
                {doneCount > 0 && doneCount === storyboardPanels.length && (
                  <div style={{ marginTop: 24, padding: "16px 20px", borderRadius: 12, background: "linear-gradient(135deg, rgba(74,222,128,0.08), rgba(34,197,94,0.04))", border: "1px solid rgba(74,222,128,0.2)", textAlign: "center" }}>
                    <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600, color: "#4ade80" }}>🎉 {storyboardPanels.length} 格分镜全部生成完毕</p>
                    <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.35)" }}>逐个下载视频片段，用剪映或 CapCut 按顺序拼接，即可得到完整漫剧</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      ) : (
        /* ═══════════════════════════════════════════════════════════════
            普通模式（原有界面，完全保留）
        ═══════════════════════════════════════════════════════════════ */
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
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 2 }}><span>1s</span><span>8s</span><span>15s</span></div>
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
        textarea:focus, input:focus { border-color: rgba(168,85,247,0.35) !important; }
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
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, ArrowLeft, Ban, Bot, Check, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, CircleAlert, Clock3, Folder, FolderPlus, FolderSearch, Hand, ImagePlus, LoaderCircle, PlugZap, Plus, RefreshCw, Search, Send, ShieldAlert, SquarePen, Terminal, UserRound, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { QRCodeSVG } from "qrcode.react";
import { createClientMessageId } from "./client-id";
import "./styles.css";

type Status = "idle" | "running" | "waiting_approval" | "completed" | "interrupted" | "error";
interface Thread { id: string; title: string; cwd: string | null; updatedAt: string; status: Status; preview: string }
interface ActivityFile { path: string; additions: number; deletions: number }
interface Item { id: string; threadId: string; timestamp: string | null; kind: string; role: string; text: string; images?: Array<{ source: string; alt?: string }>; eventType?: string; phase?: string; activity?: { type: "command" | "file_change"; fileCount?: number; additions?: number; deletions?: number; files?: ActivityFile[] } }
type DisplayItem =
  | { type: "message" | "reasoning"; item: Item }
  | { type: "commands"; id: string; count: number }
  | { type: "file_change"; id: string; fileCount: number; additions: number; deletions: number; files: ActivityFile[] };
interface Approval { id: string; threadId: string; kind: string; title: string; detail: string; source: string }
interface Project { id: string; name: string; rootPaths: string[]; threadIds: string[] }
type PermissionMode = "ask" | "auto" | "full-access";
interface DesktopPermission { mode: PermissionMode | null; label: string | null; available: boolean }
interface DesktopState { connected?: boolean; editorReady?: boolean; currentThreadId?: string | null; runningThreadIds?: string[]; approval?: Approval | null; permissions?: DesktopPermission }
type FollowUpMode = "queue" | "steer" | "interrupt";
interface PendingImage { id: string; file: File; preview: string }
interface PairingInfo { available: boolean; expiresAt: number; pairingCode: string; urls: string[] }

const recentGroupId = "__recent__";

function initialExpandedGroups(): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem("expandedProjectIds") ?? "null");
    if (Array.isArray(saved)) return new Set(saved.filter((value): value is string => typeof value === "string"));
  } catch { /* Ignore invalid state from an older version. */ }
  return new Set([recentGroupId]);
}

function normalizedPath(value: string | null): string {
  return (value ?? "").replace(/[\\/]+$/, "").replace(/\\/g, "/").toLocaleLowerCase();
}

function relativeActivityPath(filePath: string, cwd: string | null): string {
  const normalizedFile = filePath.replace(/\\/g, "/");
  const normalizedRoot = (cwd ?? "").replace(/\\/g, "/").replace(/\/$/, "");
  return normalizedRoot && normalizedFile.toLocaleLowerCase().startsWith(`${normalizedRoot.toLocaleLowerCase()}/`)
    ? normalizedFile.slice(normalizedRoot.length + 1)
    : normalizedFile;
}

let bridgeToken = localStorage.getItem("bridgeToken") ?? "";
const headers = (): HeadersInit => bridgeToken ? { Authorization: `Bearer ${bridgeToken}` } : {};

function clearBridgeToken(): void {
  bridgeToken = "";
  localStorage.removeItem("bridgeToken");
  window.dispatchEvent(new Event("bridge-auth-required"));
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...headers(), "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) clearBridgeToken();
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

function imageSource(source: string, threadId: string): string {
  if (/^(?:data:|blob:|https?:)/i.test(source)) return source;
  return `/api/media?threadId=${encodeURIComponent(threadId)}&path=${encodeURIComponent(source)}${bridgeToken ? `&token=${encodeURIComponent(bridgeToken)}` : ""}`;
}

async function imagePayload(image: PendingImage): Promise<{ name: string; mimeType: string; data: string }> {
  const bytes = new Uint8Array(await image.file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return { name: image.file.name, mimeType: image.file.type, data: btoa(binary) };
}

const statusLabel: Record<Status, string> = { idle: "空闲", running: "运行中", waiting_approval: "等待审批", completed: "已完成", interrupted: "已中止", error: "错误" };

const permissionModes: Array<{ mode: PermissionMode; title: string; description: string; icon: typeof Hand }> = [
  { mode: "ask", title: "请求批准", description: "编辑外部文件和使用互联网时始终询问", icon: Hand },
  { mode: "auto", title: "替我审批", description: "仅对检测到的风险操作请求批准", icon: Bot },
  { mode: "full-access", title: "完全访问权限", description: "可不受限制地访问互联网和您电脑上的任何文件", icon: ShieldAlert },
];

const followUpModes: Array<{ mode: FollowUpMode; title: string; description: string; icon: typeof Activity }> = [
  { mode: "steer", title: "引导当前任务", description: "让 Codex 立即根据这条消息调整当前工作", icon: Activity },
  { mode: "queue", title: "排队发送", description: "当前任务完成后，再自动发送这条消息", icon: Clock3 },
  { mode: "interrupt", title: "停止并发送", description: "先停止当前任务，然后发送这条消息", icon: Ban },
];

function permissionModeLabel(mode: PermissionMode | null, fallback: string | null = null): string {
  return permissionModes.find((option) => option.mode === mode)?.title.replace("权限", "") ?? fallback ?? "权限未知";
}

function friendlyError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/unauthorized/i.test(message)) return "尚未连接，请先输入配对码";
  if (/invalid or expired pairing code/i.test(message)) return "配对码错误或已过期，请使用启动窗口中最新的配对码";
  if (/pairing temporarily locked/i.test(message)) return "配对尝试次数过多，请重新运行一键启动脚本";
  if (/thread not found/i.test(message)) return "任务不存在或已被移除";
  if (/content must contain/i.test(message)) return "消息内容不能为空或过长";
  if (/message or image is required/i.test(message)) return "请输入消息或添加图片";
  if (/images must be|image data is invalid|each image must be|images must use/i.test(message)) return "图片无效；每条最多 4 张，每张不超过 10 MB";
  if (/image input is unavailable/i.test(message)) return "未找到 Desktop 图片上传入口，请重启 Codex Desktop 后重试";
  if (/uuid clientmessageid/i.test(message)) return "消息标识无效，请重新发送";
  if (/decision must be/i.test(message)) return "审批操作无效，请重试";
  if (/already running/i.test(message)) return "当前任务仍在运行，请等待完成或先停止任务";
  if (/follow-up mode must be/i.test(message)) return "后续消息处理方式无效，请重新选择";
  if (/task is no longer running/i.test(message)) return "当前任务已经结束，请直接发送消息";
  if (/accepted the follow-up/i.test(message)) return "后续消息已提交，但暂未读取到任务记录，请到桌面端检查";
  if (/stop control is not visible/i.test(message)) return "暂时找不到停止按钮，请确认桌面端正在运行此任务";
  if (/(approval|rejection) control is not visible/i.test(message)) return "暂时找不到审批按钮，请确认桌面端正在等待审批";
  if (/composer was not found|composer content did not match/i.test(message)) return "无法操作桌面端输入框，请重新运行一键启动脚本";
  if (/absolute directory path is required|directory path is required/i.test(message)) return "目录路径无效";
  if (/enoent|eacces|eperm|无法读取目录/i.test(message)) return "无法读取该目录，请换一个文件夹";
  if (/send control is unavailable/i.test(message)) return "桌面端发送按钮暂时不可用，请稍后重试";
  if (/no matching jsonl receipt/i.test(message)) return "消息已提交，但暂未确认写入记录，请到桌面端检查";
  if (/main page was not found|connectovercdp|cdp endpoint/i.test(message)) return "无法连接 Codex 桌面端，请重新运行一键启动脚本";
  if (/timeout.*exceeded|desktop request timed out/i.test(message)) return "桌面端响应超时，请确认 Codex 窗口运行正常后重试";
  if (/new task control is unavailable/i.test(message)) return "暂时找不到新建任务按钮，请确认 Codex 桌面端已经打开";
  if (/new task was submitted/i.test(message)) return "新任务已提交，但暂未读取到任务记录，请到桌面端检查";
  if (/project not found/i.test(message)) return "所选项目不存在，请刷新项目列表";
  if (/project name already exists/i.test(message)) return "项目名称已经存在，请换一个名称";
  if (/absolute project folder path/i.test(message)) return "请输入项目文件夹的完整路径";
  if (/project folder does not exist/i.test(message)) return "项目文件夹不存在，请检查电脑上的路径";
  if (/project name is invalid/i.test(message)) return "项目名称无效，请重新输入";
  if (/desktop bridge is unavailable|failed to update codex desktop state/i.test(message)) return "无法更新 Codex 桌面端，请重新运行一键启动脚本";
  if (/permission control is unavailable|permission options are unavailable|permission mode is unavailable/i.test(message)) return "桌面端权限菜单暂时不可用，请确认当前任务编辑区已打开";
  if (/requested codex permission mode is disabled/i.test(message)) return "该权限已被 Desktop 策略禁用，无法从网页切换";
  if (/permission mode did not change/i.test(message)) return "权限请求已发送，但 Desktop 未确认变更，请回到桌面端检查";
  if (/failed to fetch|networkerror|load failed/i.test(message)) return "无法连接本机服务，请确认一键启动窗口仍在运行";
  if (/internal error/i.test(message)) return "服务内部出错，请重新运行一键启动脚本";
  if (/^http 4\d\d$/i.test(message)) return "请求无效，请刷新页面后重试";
  if (/^http 5\d\d$/i.test(message)) return "本机服务暂时出错，请稍后重试";
  return `操作未完成：${message}`;
}

function eventLabel(item: Item): string {
  if (item.role === "user") return "你";
  if (item.role === "assistant") return "Codex";
  return "系统";
}

function MarkdownText({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>;
}

function MessageImages({ images, threadId }: { images: NonNullable<Item["images"]>; threadId: string }) {
  return <div className="message-images">{images.map((image, index) => {
    const source = imageSource(image.source, threadId);
    return <a key={`${image.source}:${index}`} href={source} target="_blank" rel="noreferrer"><img src={source} alt={image.alt ?? `图片 ${index + 1}`} loading="lazy" /></a>;
  })}</div>;
}

function FileChangeCard({ display }: { display: Extract<DisplayItem, { type: "file_change" }> }) {
  const [expanded, setExpanded] = useState(false);
  const collapsedCount = 3;
  const canCollapse = display.files.length > collapsedCount;
  const visibleFiles = expanded ? display.files : display.files.slice(0, collapsedCount);
  const hiddenCount = display.files.length - visibleFiles.length;
  const listId = `file-list-${display.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return <section className="file-change-card">
    <header>
      <span className="file-change-icon"><SquarePen size={17} /></span>
      <div><strong>已编辑 {display.fileCount} 个文件</strong><span className="file-change-total">{display.additions > 0 && <b>+{display.additions}</b>}{display.deletions > 0 && <em>-{display.deletions}</em>}</span></div>
    </header>
    {visibleFiles.length > 0 && <div className="file-change-list" id={listId}>{visibleFiles.map((file) => <div key={file.path}><span title={file.path}>{file.path}</span><span className="file-change-diff">{file.additions > 0 && <b>+{file.additions}</b>}{file.deletions > 0 && <em>-{file.deletions}</em>}</span></div>)}</div>}
    {canCollapse && <button className="file-change-toggle" type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls={listId}>
      <span>{expanded ? "收起文件" : `再显示 ${hiddenCount} 个文件`}</span>{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </button>}
  </section>;
}

function isActivelyRunning(thread: Thread, _desktopThreadId: string | null = null): boolean {
  return thread.status === "running";
}

function applyDesktopRuntime(threads: Thread[], status: DesktopState): Thread[] {
  if (!status.connected || !Array.isArray(status.runningThreadIds)) return threads;
  const running = new Set(status.runningThreadIds.filter((id) => typeof id === "string" && id && !id.startsWith("client-new-thread:")));
  return threads.map((thread) => {
    if (running.has(thread.id)) return thread.status === "running" ? thread : { ...thread, status: "running" };
    // Only demote session-running tasks that desktop no longer reports as active.
    return thread.status === "running" ? { ...thread, status: "interrupted" } : thread;
  });
}

function App() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [followUpContent, setFollowUpContent] = useState("");
  const [streamingOutput, setStreamingOutput] = useState<{ threadId: string; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [cdpReady, setCdpReady] = useState(false);
  const [desktopThreadId, setDesktopThreadId] = useState<string | null>(null);
  const [switchingThread, setSwitchingThread] = useState(false);
  const [error, setError] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [needsPairing, setNeedsPairing] = useState(false);
  const [pairingInfo, setPairingInfo] = useState<PairingInfo | null>(null);
  const [authEpoch, setAuthEpoch] = useState(0);
  const [controlBusy, setControlBusy] = useState(false);
  const [desktopApproval, setDesktopApproval] = useState<Approval | null>(null);
  const [desktopPermissions, setDesktopPermissions] = useState<DesktopPermission>({ mode: null, label: null, available: false });
  const [dialog, setDialog] = useState<"task" | "project" | "permissions" | "follow-up" | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [permissionConfirm, setPermissionConfirm] = useState(false);
  const [newTaskProjectId, setNewTaskProjectId] = useState("");
  const [newTaskContent, setNewTaskContent] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(initialExpandedGroups);
  const timelineRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<string | null>(null);
  const openRequestRef = useRef(0);
  const lastAutoExpandedRef = useRef("");

  const selectedThread = threads.find((thread) => thread.id === selected) ?? null;
  const displayItems = useMemo<DisplayItem[]>(() => {
    const result: DisplayItem[] = [];
    let toolBuffer: Item[] = [];
    let pendingReasoning: Item | null = null;
    const flushTools = () => {
      if (!toolBuffer.length) return;
      const commands = toolBuffer.filter((item) => item.activity?.type !== "file_change");
      const fileChanges = toolBuffer.filter((item) => item.activity?.type === "file_change");
      if (commands.length) result.push({ type: "commands", id: `${commands[0].id}:commands`, count: commands.length });
      if (fileChanges.length) {
        const filesByPath = new Map<string, ActivityFile>();
        for (const item of fileChanges) for (const file of item.activity?.files ?? []) {
          const filePath = relativeActivityPath(file.path, selectedThread?.cwd ?? null);
          const existing = filesByPath.get(filePath);
          if (existing) {
            existing.additions += file.additions;
            existing.deletions += file.deletions;
          } else {
            filesByPath.set(filePath, { ...file, path: filePath });
          }
        }
        const files = [...filesByPath.values()];
        result.push({
          type: "file_change",
          id: `${fileChanges[0].id}:files`,
          fileCount: files.length || fileChanges.reduce((sum, item) => sum + (item.activity?.fileCount ?? 1), 0),
          additions: fileChanges.reduce((sum, item) => sum + (item.activity?.additions ?? 0), 0),
          deletions: fileChanges.reduce((sum, item) => sum + (item.activity?.deletions ?? 0), 0),
          files,
        });
      }
      toolBuffer = [];
    };
    for (const item of items) {
      if (item.kind === "reasoning") {
        pendingReasoning = item;
        continue;
      }
      if (item.kind === "tool_call") {
        if (item.activity?.type === "file_change" && toolBuffer.at(-1)?.activity?.type === "command") toolBuffer.pop();
        toolBuffer.push(item);
        continue;
      }
      if (item.kind !== "message") continue;
      flushTools();
      pendingReasoning = null;
      result.push({ type: "message", item });
    }
    flushTools();
    if (pendingReasoning) result.push({ type: "reasoning", item: pendingReasoning });
    return result;
  }, [items, selectedThread?.cwd]);
  const groupedThreads = useMemo(() => {
    const queryText = query.trim().toLocaleLowerCase();
    const claimed = new Set<string>();
    const assignedProjectByThread = new Map<string, string>();
    for (const project of projects) for (const threadId of project.threadIds ?? []) assignedProjectByThread.set(threadId, project.id);
    const groups = projects.map((project) => {
      const roots = project.rootPaths.map(normalizedPath);
      const projectMatches = `${project.name} ${project.rootPaths.join(" ")}`.toLocaleLowerCase().includes(queryText);
      const projectThreads = threads.filter((thread) => {
        const threadPath = normalizedPath(thread.cwd);
        const assignedProjectId = assignedProjectByThread.get(thread.id);
        const belongs = assignedProjectId ? assignedProjectId === project.id : Boolean(threadPath) && roots.some((root) => threadPath === root || threadPath.startsWith(`${root}/`));
        if (!belongs) return false;
        claimed.add(thread.id);
        return !queryText || projectMatches || `${thread.title} ${thread.preview} ${thread.cwd ?? ""}`.toLocaleLowerCase().includes(queryText);
      });
      return { project, threads: projectThreads, visible: !queryText || projectMatches || projectThreads.length > 0 };
    });
    const recent = threads.filter((thread) => !claimed.has(thread.id) && (!queryText || `${thread.title} ${thread.preview} ${thread.cwd ?? ""}`.toLocaleLowerCase().includes(queryText)));
    return { groups, recent };
  }, [threads, projects, query]);

  const projectForThread = useMemo(() => {
    const result = new Map<string, string>();
    for (const group of groupedThreads.groups) for (const thread of group.threads) result.set(thread.id, group.project.id);
    return result;
  }, [groupedThreads]);

  function toggleGroup(id: string) {
    setExpandedProjects((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openTaskDialog(projectId = "") {
    setNewTaskProjectId(projectId);
    setDialog("task");
  }

  function openFolderBrowser() {
    setFolderBrowserOpen(true);
  }

  function openPermissionsDialog() {
    setPermissionConfirm(false);
    setError("");
    setDialog("permissions");
  }

  async function refreshThreads() {
    try {
      const [{ threads: next }, status] = await Promise.all([api<{ threads: Thread[] }>("/api/threads"), api<{ cdp?: DesktopState }>("/api/status")]);
      setThreads(applyDesktopRuntime(next, status.cdp ?? {}));
      setCdpReady(Boolean(status.cdp?.connected && status.cdp?.editorReady));
      setDesktopThreadId(status.cdp?.currentThreadId ?? null);
      setDesktopApproval(status.cdp?.approval ?? null);
      setDesktopPermissions(status.cdp?.permissions ?? { mode: null, label: null, available: false });
      setNeedsPairing(false);
      setError("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const unauthorized = /unauthorized/i.test(message);
      setNeedsPairing(unauthorized);
      setError(unauthorized ? "" : friendlyError(cause));
    }
  }

  async function refreshProjects(showError = false) {
    try {
      const result = await api<{ projects: Project[] }>("/api/projects");
      setProjects(result.projects);
    } catch (cause) {
      if (showError) setError(friendlyError(cause));
    }
  }

  async function refreshPairingInfo() {
    try {
      const response = await fetch("/api/pairing-info");
      if (!response.ok) return;
      setPairingInfo(await response.json() as PairingInfo);
    } catch { /* The manual pairing form remains available. */ }
  }

  async function openThread(id: string, syncDesktop = true) {
    const requestId = ++openRequestRef.current;
    setSelected(id);
    setSwitchingThread(syncDesktop);
    setItems([]);
    setApprovals([]);
    setError("");
    const timelineRequest = api<{ items: Item[]; approvals?: Approval[] }>(`/api/threads/${id}/timeline`);
    const desktopRequest = syncDesktop
      ? api<{ threadId: string }>(`/api/threads/${id}/open`, { method: "POST", body: "{}" })
      : Promise.resolve(null);

    try {
      const timeline = await timelineRequest;
      if (requestId === openRequestRef.current) {
        setItems(timeline.items);
        setApprovals(timeline.approvals ?? []);
      }
    } catch (cause) {
      if (requestId === openRequestRef.current) setError(friendlyError(cause));
    }

    try {
      const desktop = await desktopRequest;
      if (requestId === openRequestRef.current && desktop?.threadId) setDesktopThreadId(desktop.threadId);
    } catch (cause) {
      if (requestId === openRequestRef.current) setError(friendlyError(cause));
    } finally {
      if (requestId === openRequestRef.current) setSwitchingThread(false);
    }
  }

  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => {
    const handleAuthRequired = () => {
      setNeedsPairing(true);
      setConnected(false);
      setCdpReady(false);
      setAuthEpoch((value) => value + 1);
    };
    window.addEventListener("bridge-auth-required", handleAuthRequired);
    return () => window.removeEventListener("bridge-auth-required", handleAuthRequired);
  }, []);
  useEffect(() => { localStorage.setItem("expandedProjectIds", JSON.stringify([...expandedProjects])); }, [expandedProjects]);
  useEffect(() => {
    if (!desktopThreadId) return;
    const projectId = projectForThread.get(desktopThreadId) ?? recentGroupId;
    const key = `${desktopThreadId}:${projectId}`;
    if (lastAutoExpandedRef.current === key) return;
    lastAutoExpandedRef.current = key;
    setExpandedProjects((current) => current.has(projectId) ? current : new Set([...current, projectId]));
  }, [desktopThreadId, projectForThread]);
  useEffect(() => { void refreshThreads(); void refreshProjects(); }, []);
  useEffect(() => {
    if (!needsPairing) return;
    void refreshPairingInfo();
    const timer = window.setInterval(() => void refreshPairingInfo(), 15_000);
    return () => window.clearInterval(timer);
  }, [needsPairing]);
  useEffect(() => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/ws${bridgeToken ? `?token=${encodeURIComponent(bridgeToken)}` : ""}`);
    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onmessage = (message) => {
      const data = JSON.parse(message.data);
      if (data.type === "desktop_state") {
        setThreads((current) => applyDesktopRuntime(current, data.status ?? {}));
        setCdpReady(Boolean(data.status?.connected && data.status?.editorReady));
        setDesktopThreadId(data.status?.currentThreadId ?? null);
        setDesktopApproval(data.status?.approval ?? null);
        setDesktopPermissions(data.status?.permissions ?? { mode: null, label: null, available: false });
        return;
      }
      if (data.type === "stream_output") {
        setStreamingOutput(data.output ?? null);
        return;
      }
      if (data.type === "session_event") {
        const event = data.event;
        setThreads((current) => current.map((thread) => thread.id === event.threadId ? { ...thread, status: event.status ?? thread.status, updatedAt: event.timestamp } : thread));
        if (event.threadId === selectedRef.current && event.item) setItems((current) => current.some((item) => item.id === event.item.id) ? current : [...current, event.item]);
      }
    };
    return () => socket.close();
  }, [authEpoch]);
  useEffect(() => {
    if (selected && desktopThreadId && selected !== desktopThreadId && !switchingThread && !sending && !controlBusy && !dialogBusy) {
      void openThread(desktopThreadId, false);
    }
  }, [desktopThreadId]);
  useEffect(() => {
    const timeline = timelineRef.current;
    if (timeline) timeline.scrollTop = timeline.scrollHeight;
  }, [items, streamingOutput?.text]);

  function addImages(files: File[]) {
    const supported = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);
    const valid = files.filter((file) => supported.has(file.type) && file.size > 0 && file.size <= 10 * 1024 * 1024);
    if (valid.length !== files.length) setError("仅支持 10 MB 以内的 AVIF、GIF、JPEG、PNG 或 WebP 图片");
    if (!valid.length) return;
    setPendingImages((current) => {
      const available = Math.max(0, 4 - current.length);
      if (valid.length > available) setError("每条消息最多添加 4 张图片");
      return [...current, ...valid.slice(0, available).map((file) => ({ id: createClientMessageId(), file, preview: URL.createObjectURL(file) }))];
    });
  }

  function removeImage(id: string) {
    setPendingImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return current.filter((image) => image.id !== id);
    });
  }

  function clearImages() {
    setPendingImages((current) => {
      for (const image of current) URL.revokeObjectURL(image.preview);
      return [];
    });
  }

  async function sendMessage() {
    if (!selected || (!draft.trim() && !pendingImages.length) || sending || switchingThread) return;
    const content = draft.trim();
    if (selectedThread?.status === "running") {
      setFollowUpContent(content);
      setError("");
      setDialog("follow-up");
      return;
    }
    setSending(true);
    setError("");
    try {
      await api(`/api/threads/${selected}/send`, { method: "POST", body: JSON.stringify({ content, images: await Promise.all(pendingImages.map(imagePayload)), clientMessageId: createClientMessageId() }) });
      setDraft("");
      clearImages();
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setSending(false); }
  }

  async function submitFollowUp(mode: FollowUpMode) {
    if (!selected || (!followUpContent.trim() && !pendingImages.length) || dialogBusy) return;
    setDialogBusy(true);
    setError("");
    try {
      await api(`/api/threads/${selected}/follow-up`, {
        method: "POST",
        body: JSON.stringify({ content: followUpContent, images: await Promise.all(pendingImages.map(imagePayload)), mode, clientMessageId: createClientMessageId() }),
      });
      setDraft("");
      setFollowUpContent("");
      clearImages();
      setDialog(null);
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setDialogBusy(false); }
  }

  async function createTask(event: React.FormEvent) {
    event.preventDefault();
    if (!newTaskContent.trim() || dialogBusy) return;
    setDialogBusy(true);
    setError("");
    try {
      const result = await api<{ threadId: string }>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ projectId: newTaskProjectId || null, content: newTaskContent.trim(), clientMessageId: createClientMessageId() }),
      });
      setDialog(null);
      setNewTaskContent("");
      await refreshThreads();
      await openThread(result.threadId, false);
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setDialogBusy(false); }
  }

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    if (!projectPath.trim() || dialogBusy) return;
    setDialogBusy(true);
    setError("");
    try {
      const project = await api<Project>("/api/projects", { method: "POST", body: JSON.stringify({ name: projectName.trim(), rootPath: projectPath.trim() }) });
      await refreshProjects(true);
      setNewTaskProjectId(project.id);
      setProjectName("");
      setProjectPath("");
      setDialog("task");
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setDialogBusy(false); }
  }

  async function changePermissionMode(mode: PermissionMode) {
    if (dialogBusy || mode === desktopPermissions.mode) return;
    if (mode === "full-access" && !permissionConfirm) {
      setPermissionConfirm(true);
      return;
    }
    setDialogBusy(true);
    setError("");
    try {
      const permissions = await api<DesktopPermission>("/api/permissions", { method: "PUT", body: JSON.stringify({ mode }) });
      setDesktopPermissions(permissions);
      setPermissionConfirm(false);
      setDialog(null);
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setDialogBusy(false); }
  }

  async function control(path: string, body?: object) {
    if (!selected || controlBusy) return;
    setControlBusy(true);
    setError("");
    try {
      await api(`/api/threads/${selected}/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) });
      await refreshThreads();
      await openThread(selected);
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setControlBusy(false); }
  }

  async function pairWithCode(rawCode: string) {
    const code = rawCode.trim();
    if (!code || pairing) return;
    setPairing(true);
    setError("");
    try {
      const result = await api<{ token: string }>("/api/pair", { method: "POST", body: JSON.stringify({ code }) });
      bridgeToken = result.token;
      localStorage.setItem("bridgeToken", bridgeToken);
      setPairingCode("");
      history.replaceState(null, "", location.pathname);
      setAuthEpoch((value) => value + 1);
      await refreshThreads();
      await refreshProjects();
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setPairing(false); }
  }

  async function pairDevice(event: React.FormEvent) {
    event.preventDefault();
    await pairWithCode(pairingCode);
  }

  useEffect(() => {
    if (!needsPairing || pairing || bridgeToken) return;
    const code = new URLSearchParams(location.search).get("pairing");
    if (code) void pairWithCode(code);
  }, [needsPairing]);

  const approvalVisible = Boolean(selected && (selectedThread?.status === "waiting_approval" || approvals.length > 0 || desktopApproval?.threadId === selected));
  const lastAssistantText = [...items].reverse().find((item) => item.kind === "message" && item.role === "assistant")?.text.trim() ?? "";
  const lastUserText = [...items].reverse().find((item) => item.kind === "message" && item.role === "user")?.text.trim() ?? "";
  const streamedText = streamingOutput?.text.trim() ?? "";
  const liveOutput = streamingOutput?.threadId === selected && streamedText !== lastAssistantText && streamedText !== lastUserText ? streamingOutput.text : "";

  return <main className={`app${selected ? " thread-open" : ""}${needsPairing ? " pairing-open" : ""}`}>
    <aside className="sidebar">
      <header className="brand"><div className="brand-mark"><Terminal size={19} /></div><div><strong>Codex 远程控制</strong><span>本地任务工作台</span></div><div className="brand-actions"><button className="icon-button" onClick={() => openTaskDialog()} title="新建任务" disabled={!cdpReady}><SquarePen size={18} /></button><button className="icon-button" onClick={() => setDialog("project")} title="创建项目" disabled={!cdpReady}><FolderPlus size={18} /></button><button className="icon-button" onClick={() => { void refreshThreads(); void refreshProjects(); }} title="刷新任务"><RefreshCw size={18} /></button></div></header>
      <div className="connection-row"><span className={connected ? "dot online" : "dot"} />{connected ? "实时连接" : "连接断开"}<span className="divider" /><PlugZap size={14} />{cdpReady ? "可控制" : "只读"}</div>
      <label className="search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务" /></label>
      <div className="thread-list">
        {groupedThreads.groups.filter((group) => group.visible).map(({ project, threads: projectThreads }) => {
          const expanded = expandedProjects.has(project.id) || Boolean(query.trim());
          const containsCurrent = projectThreads.some((thread) => thread.id === desktopThreadId);
          const projectRunning = projectThreads.some((thread) => isActivelyRunning(thread, desktopThreadId));
          return <section className="project-group" key={project.id}>
            <div className={`project-row${containsCurrent ? " active" : ""}`}>
              <button className="project-toggle" onClick={() => toggleGroup(project.id)} aria-expanded={expanded} title={expanded ? `折叠 ${project.name}` : `展开 ${project.name}`}>
                <ChevronRight className="project-chevron" size={16} />{projectRunning ? <LoaderCircle className="spin project-running" size={17} /> : <Folder size={17} />}<span>{project.name}</span><small>{projectThreads.length}</small>
              </button>
              <button className="project-new-task" onClick={() => openTaskDialog(project.id)} title={`在 ${project.name} 中新建任务`} disabled={!cdpReady}><Plus size={16} /></button>
            </div>
            {expanded && <div className="project-threads">{projectThreads.length ? projectThreads.map((thread) => <button key={thread.id} className={`thread-row nested ${selected === thread.id ? "selected" : ""}`} onClick={() => void openThread(thread.id)} aria-current={desktopThreadId === thread.id ? "page" : undefined}>
              <span className="thread-state">{isActivelyRunning(thread, desktopThreadId) ? <LoaderCircle className="spin running-spinner" size={14} /> : <span className={`status-pip ${thread.status}`} />}</span>
              <span className="thread-copy"><strong>{thread.title}</strong><span>{thread.preview || "暂无摘要"}</span></span>
              <time>{new Date(thread.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
            </button>) : <p className="group-empty">暂无任务</p>}</div>}
          </section>;
        })}
        {(groupedThreads.recent.length > 0 || !query.trim()) && <section className="project-group recent-group">
          <div className="project-row">
            <button className="project-toggle" onClick={() => toggleGroup(recentGroupId)} aria-expanded={expandedProjects.has(recentGroupId) || Boolean(query.trim())} title="展开或折叠最近任务">
              <ChevronRight className="project-chevron" size={16} />{groupedThreads.recent.some((thread) => isActivelyRunning(thread, desktopThreadId)) ? <LoaderCircle className="spin project-running" size={17} /> : <Clock3 size={17} />}<span>最近</span><small>{groupedThreads.recent.length}</small>
            </button>
            <button className="project-new-task" onClick={() => openTaskDialog()} title="新建普通对话" disabled={!cdpReady}><Plus size={16} /></button>
          </div>
          {(expandedProjects.has(recentGroupId) || Boolean(query.trim())) && <div className="project-threads">{groupedThreads.recent.map((thread) => <button key={thread.id} className={`thread-row nested ${selected === thread.id ? "selected" : ""}`} onClick={() => void openThread(thread.id)} aria-current={desktopThreadId === thread.id ? "page" : undefined}>
            <span className="thread-state">{isActivelyRunning(thread, desktopThreadId) ? <LoaderCircle className="spin running-spinner" size={14} /> : <span className={`status-pip ${thread.status}`} />}</span>
            <span className="thread-copy"><strong>{thread.title}</strong><span>{thread.preview || thread.cwd || "暂无摘要"}</span></span>
            <time>{new Date(thread.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
          </button>)}</div>}
        </section>}
        {query.trim() && groupedThreads.groups.every((group) => !group.visible) && groupedThreads.recent.length === 0 && <p className="sidebar-empty">没有找到相关任务</p>}
      </div>
    </aside>
    <section className="workspace">
      {selectedThread ? <>
        <header className="thread-header"><button className="icon-button mobile-back" onClick={() => setSelected(null)} title="返回任务列表"><ArrowLeft size={20} /></button><div><h1>{selectedThread.title}</h1><p>{selectedThread.cwd}</p></div><span className={`status-chip ${switchingThread ? "syncing" : selectedThread.status}`}>{switchingThread ? <LoaderCircle className="spin" size={14} /> : selectedThread.status === "running" ? <Activity size={14} /> : selectedThread.status === "waiting_approval" ? <CircleAlert size={14} /> : <CheckCircle2 size={14} />}{switchingThread ? "正在同步" : statusLabel[selectedThread.status]}</span><div className="thread-actions">{selectedThread.status === "running" && <button className="control-button danger" onClick={() => void control("stop")} disabled={controlBusy || switchingThread} title="停止任务"><Ban size={16} />停止</button>}{approvalVisible && <><button className="control-button approve" onClick={() => void control("approval", { decision: "approve" })} disabled={controlBusy || switchingThread} title="批准"><Check size={16} />批准</button><button className="control-button reject" onClick={() => void control("approval", { decision: "reject" })} disabled={controlBusy || switchingThread} title="拒绝"><X size={16} />拒绝</button></>}</div></header>
        <div className="timeline" ref={timelineRef}>
          {displayItems.map((display) => {
            if (display.type === "reasoning") return <div key={display.item.id} className={`progress-event${isActivelyRunning(selectedThread, desktopThreadId) ? " active" : ""}`}>{display.item.text}</div>;
            if (display.type === "commands") return <div key={display.id} className="activity-row"><Terminal size={15} /><span>{display.count > 1 ? "运行了多个命令" : "运行了 1 个命令"}</span></div>;
            if (display.type === "file_change") return <FileChangeCard key={display.id} display={display} />;
            const item = display.item;
            if (item.role === "assistant") return <article key={item.id} className="assistant-message markdown-body">{item.images?.length ? <MessageImages images={item.images} threadId={item.threadId} /> : null}{item.text && <MarkdownText text={item.text} />}</article>;
            return <article key={item.id} className={`event ${item.role}`}>
              <div className="event-icon">{item.role === "user" ? <UserRound size={16} /> : <Clock3 size={16} />}</div>
              <div className="event-body"><div className="event-meta"><span>{eventLabel(item)}</span>{item.timestamp && <time>{new Date(item.timestamp).toLocaleTimeString()}</time>}</div>{item.images?.length ? <MessageImages images={item.images} threadId={item.threadId} /> : null}{item.text && <div className="message-text markdown-body"><MarkdownText text={item.text} /></div>}</div>
            </article>;
          })}
          {liveOutput && <article className="assistant-message markdown-body streaming-message"><MarkdownText text={liveOutput} /><span className="stream-caret" aria-hidden="true" /></article>}
        </div>
        {error && <div className="error-bar"><CircleAlert size={16} />{error}</div>}
        <footer className="composer">
          <div className="composer-toolbar">
            <button className={`permission-trigger ${desktopPermissions.mode ?? "unknown"}`} type="button" onClick={openPermissionsDialog} disabled={!desktopPermissions.available} title={desktopPermissions.available ? "更改 Desktop 权限" : "Desktop 权限暂不可用"}>
              {desktopPermissions.mode === "full-access" ? <ShieldAlert size={15} /> : desktopPermissions.mode === "auto" ? <Bot size={15} /> : <Hand size={15} />}
              <span>{permissionModeLabel(desktopPermissions.mode, desktopPermissions.label)}</span><ChevronUp size={14} />
            </button>
            <button className="attach-button" type="button" onClick={() => imageInputRef.current?.click()} disabled={!cdpReady || sending || switchingThread || pendingImages.length >= 4} title="添加图片"><ImagePlus size={16} /></button>
            <input ref={imageInputRef} className="image-file-input" type="file" accept="image/avif,image/gif,image/jpeg,image/png,image/webp" multiple onChange={(event) => { addImages(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
          </div>
          {pendingImages.length > 0 && <div className="pending-images">{pendingImages.map((image) => <div className="pending-image" key={image.id}><img src={image.preview} alt={image.file.name} /><button type="button" onClick={() => removeImage(image.id)} title={`移除 ${image.file.name}`} disabled={sending}><X size={14} /></button></div>)}</div>}
          <div className="composer-input-row"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onPaste={(event) => { const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/")); if (images.length) { event.preventDefault(); addImages(images); } }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder={switchingThread ? "正在同步桌面任务…" : sending ? "正在发送，请稍候…" : cdpReady ? "向当前任务发送消息" : "桌面控制尚未连接，当前为只读模式"} disabled={!cdpReady || sending || switchingThread} /><button className="send-button" onClick={() => void sendMessage()} disabled={!cdpReady || (!draft.trim() && !pendingImages.length) || sending || switchingThread} title={sending ? "正在发送" : "发送"}>{sending ? <LoaderCircle className="spin" size={19} /> : <Send size={19} />}</button></div>
        </footer>
      </> : <div className={`empty${needsPairing ? " pairing-empty" : ""}`}><div className="empty-mark"><Terminal size={28} /></div><h1>{needsPairing ? "连接这台电脑" : "选择一个任务"}</h1><p>{needsPairing ? pairing ? "正在验证并加载任务，请稍候…" : "手机与电脑连接同一 Wi-Fi 后，可扫码或输入配对码。" : "任务进度会从本地会话文件实时同步。"}</p>{needsPairing && pairingInfo?.urls[0] && <section className="pairing-qr" aria-label="手机扫码连接"><div className="pairing-qr-code"><QRCodeSVG value={pairingInfo.urls[0]} size={196} level="M" marginSize={1} /></div><div className="pairing-qr-copy"><strong>用手机扫码使用</strong><span>打开手机相机扫描二维码，将自动连接这台电脑。</span><small>配对码 {pairingInfo.pairingCode}</small></div></section>}{error && <div className="error-bar"><CircleAlert size={16} />{error}</div>}{needsPairing && <form className="token-form" onSubmit={(event) => void pairDevice(event)} aria-busy={pairing}><input value={pairingCode} onChange={(event) => setPairingCode(event.target.value)} placeholder="配对码" aria-label="配对码" autoComplete="one-time-code" disabled={pairing} /><button type="submit" disabled={pairing || !pairingCode.trim()}>{pairing && <LoaderCircle className="spin" size={16} aria-hidden="true" />}{pairing ? "正在配对" : "开始配对"}</button></form>}</div>}
    </section>
    {dialog && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !dialogBusy) setDialog(null); }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <header><h2 id="dialog-title">{dialog === "task" ? "新建任务" : dialog === "project" ? "创建项目" : dialog === "follow-up" ? "任务正在运行" : permissionConfirm ? "确认完全访问" : "Desktop 权限"}</h2><button className="icon-button" onClick={() => { setDialog(null); setPermissionConfirm(false); }} disabled={dialogBusy} title="关闭"><X size={19} /></button></header>
        {dialog === "follow-up" ? <div className="follow-up-options">
          <p className="follow-up-intro">这条消息将作为正在运行任务的后续指令发送：</p>
          <div className="follow-up-preview">{pendingImages.length > 0 && <span className="follow-up-image-count">已附加 {pendingImages.length} 张图片</span>}{followUpContent}</div>
          {followUpModes.map((option) => {
            const Icon = option.icon;
            return <button key={option.mode} type="button" className={`permission-option follow-up-option ${option.mode}`} onClick={() => void submitFollowUp(option.mode)} disabled={dialogBusy}>
              <span className="permission-option-icon">{dialogBusy ? <LoaderCircle className="spin" size={19} /> : <Icon size={19} />}</span>
              <span><strong>{option.title}</strong><small>{option.description}</small></span>
            </button>;
          })}
          {error && <div className="dialog-error"><CircleAlert size={16} />{error}</div>}
        </div> : dialog === "permissions" ? permissionConfirm ? <div className="permission-confirm">
          <span className="permission-confirm-icon"><ShieldAlert size={22} /></span>
          <strong>允许不受限制的访问？</strong>
          <p>Codex 将无需批准即可访问互联网、运行命令，并读取、修改或删除这台电脑上的任意文件。</p>
          {error && <div className="dialog-error"><CircleAlert size={16} />{error}</div>}
          <div className="dialog-actions"><button type="button" className="secondary" onClick={() => setPermissionConfirm(false)} disabled={dialogBusy}>返回</button><button type="button" className="danger-primary" onClick={() => void changePermissionMode("full-access")} disabled={dialogBusy}>{dialogBusy && <LoaderCircle className="spin" size={16} />}{dialogBusy ? "正在同步" : "开启完全访问"}</button></div>
        </div> : <div className="permission-options">
          {permissionModes.map((option) => {
            const Icon = option.icon;
            const selectedMode = desktopPermissions.mode === option.mode;
            return <button key={option.mode} type="button" className={`permission-option ${option.mode}${selectedMode ? " selected" : ""}`} onClick={() => void changePermissionMode(option.mode)} disabled={dialogBusy || selectedMode} aria-pressed={selectedMode}>
              <span className="permission-option-icon">{dialogBusy && !selectedMode ? <LoaderCircle className="spin" size={19} /> : <Icon size={19} />}</span>
              <span><strong>{option.title}</strong><small>{option.description}</small></span>
              {selectedMode && <Check size={18} />}
            </button>;
          })}
          {error && <div className="dialog-error"><CircleAlert size={16} />{error}</div>}
        </div> : dialog === "task" ? <form onSubmit={(event) => void createTask(event)}>
          <label className="field"><span>文件夹</span><select value={newTaskProjectId} onChange={(event) => setNewTaskProjectId(event.target.value)} disabled={dialogBusy}><option value="">不选择文件夹（普通对话）</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label className="field"><span>第一条消息</span><textarea value={newTaskContent} onChange={(event) => setNewTaskContent(event.target.value)} placeholder="输入要交给 Codex 的任务" disabled={dialogBusy} autoFocus /></label>
          <div className="dialog-actions"><button type="button" className="secondary" onClick={() => setDialog(null)} disabled={dialogBusy}>取消</button><button type="submit" className="primary" disabled={dialogBusy || !newTaskContent.trim()}>{dialogBusy && <LoaderCircle className="spin" size={16} />}{dialogBusy ? "正在创建" : "创建并发送"}</button></div>
        </form> : <form onSubmit={(event) => void createProject(event)}>
          <label className="field"><span>项目名称</span><input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="留空则使用文件夹名称" disabled={dialogBusy} autoFocus /></label>
          <label className="field"><span>项目文件夹路径</span><div className="path-row"><input value={projectPath} onChange={(event) => setProjectPath(event.target.value)} placeholder="例如 C:\Users\你的用户名\Desktop\项目" disabled={dialogBusy} /><button type="button" className="path-pick" onClick={() => openFolderBrowser()} disabled={dialogBusy || folderBrowserOpen} title="浏览远程电脑文件夹"><FolderSearch size={16} />浏览...</button></div></label>
          <div className="dialog-actions"><button type="button" className="secondary" onClick={() => setDialog(null)} disabled={dialogBusy}>取消</button><button type="submit" className="primary" disabled={dialogBusy || !projectPath.trim()}>{dialogBusy && <LoaderCircle className="spin" size={16} />}{dialogBusy ? "正在添加" : "添加项目"}</button></div>
        </form>}
      </section>
    </div>}
    {folderBrowserOpen && <FolderBrowser
      onSelect={(path) => { setProjectPath(path); setFolderBrowserOpen(false); }}
      onClose={() => setFolderBrowserOpen(false)}
    />}
  </main>;
}

function FolderBrowser({ onSelect, onClose }: { onSelect: (path: string) => void; onClose: () => void }) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<{ name: string; path: string }[]>([]);
  const [parent, setParent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadPath(dirPath: string | null) {
    setLoading(true);
    setError("");
    try {
      if (dirPath === null) {
        const result = await api<{ home?: string; roots?: { name: string; path: string }[] }>("/api/fs/roots");
        const roots = Array.isArray(result.roots) ? result.roots : [];
        setCurrentPath(null);
        setParent(null);
        setDirectories(roots);
        if (!roots.length) setError("没有可浏览的目录，请确认 Bridge 已重启到最新版本");
      } else {
        const result = await api<{ current?: string | null; parent?: string | null; directories?: { name: string; path: string }[]; error?: string }>(`/api/fs/list?path=${encodeURIComponent(dirPath)}`);
        setCurrentPath(typeof result.current === "string" ? result.current : dirPath);
        setParent(typeof result.parent === "string" ? result.parent : null);
        setDirectories(Array.isArray(result.directories) ? result.directories : []);
        if (result.error) setError(result.error);
      }
    } catch (cause) {
      setError(friendlyError(cause));
      setDirectories([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadPath(null); }, []);

  return <div className="dialog-backdrop folder-browser-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="dialog folder-browser" role="dialog" aria-modal="true" aria-labelledby="folder-browser-title">
      <header>
        <h2 id="folder-browser-title">选择文件夹</h2>
        <button className="icon-button" onClick={onClose} title="关闭"><X size={19} /></button>
      </header>
      <div className="folder-browser-body">
        <div className="folder-browser-path" title={currentPath ?? "快捷位置"}>
          <span className="folder-breadcrumb">{currentPath ?? "快捷位置"}</span>
        </div>
        {loading ? <div className="folder-browser-loading"><LoaderCircle className="spin" size={20} />加载中…</div>
          : error ? <div className="error-bar"><CircleAlert size={16} />{error}</div>
          : <div className="folder-browser-list">
            {currentPath === null ? null : <button type="button" className="folder-browser-item parent" onClick={() => void loadPath(parent)}>{parent ? "返回上级" : "返回快捷位置"}</button>}
            {directories.length === 0 ? <div className="folder-browser-empty">此目录没有子文件夹</div> : directories.map((entry) => (
              <button key={entry.path} type="button" className="folder-browser-item" onClick={() => void loadPath(entry.path)} title={entry.path}>
                <Folder size={16} /><span>{entry.name}</span>
              </button>
            ))}
          </div>}
      </div>
      <div className="folder-browser-actions">
        <button type="button" className="secondary" onClick={onClose}>取消</button>
        <button type="button" className="primary" onClick={() => { if (currentPath) onSelect(currentPath); }} disabled={!currentPath}>选择此文件夹</button>
      </div>
    </section>
  </div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);

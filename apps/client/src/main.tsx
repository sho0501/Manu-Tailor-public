import { useLocale, LanguagePicker } from "./i18n";
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  useNavigate,
  useLocation,
  useParams,
  Link,
  Outlet,
} from "react-router-dom";
import {
  BookOpen,
  Bell,
  Home,
  Settings,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Volume2,
  Pause,
  Square,
  FileText,
  ShieldCheck,
  Plus,
  Users,
  LogOut,
  Sparkles,
  LayoutDashboard,
  ClipboardCheck,
  Upload,
  Search,
} from "lucide-react";
import {
  api,
  session,
  clearPrivateCache,
  cachedManual,
  cacheFile,
  BASE,
} from "./api";
import {
  activeServer,
  removeServer,
  savedServers,
  saveServer,
  selectServer,
  watchServers,
  type SavedServer,
} from "./servers";
import { notificationProvider } from "./notifications";
import { manualPathFromUrl } from "./deep-link";
import type {
  User,
  Profile,
  Generation,
  Notice,
  ManualDocument,
  ManualFolder,
  ManualRecord,
  Block,
} from "./types";
import {
  Button,
  Card,
  Badge,
  Alert,
  Progress,
  EmptyState,
  Skeleton,
  Toast,
  BottomSheet,
  ManualCard,
  StepCard,
  Header,
  BottomNavigation,
} from "./ui";
import "./styles.css";
import {
  AdaptiveAssessment,
  AssessmentDebug,
  QuestionBank,
} from "./assessment";
import {
  PresentationText,
  PresentationSettings,
  recordPresentationEvent,
} from "./presentation";
const Auth = createContext<{
  user: User | null;
  setUser: (u: User | null) => void;
}>({ user: null, setUser: () => {} });
const useAuth = () => useContext(Auth);
function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(() => {
    api<T>(path)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [path]);
  useEffect(reload, [reload]);
  return { data, error, reload, setData };
}
function Brand() {
  return (
    <Link to="/app" className="brand">
      <span>
        <BookOpen size={23} />
      </span>
      Manu-Tailor
    </Link>
  );
}
function App() {
  const { locale } = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale === "ja-easy" ? "ja" : locale;
  }, [locale]);
  const [user, setUser] = useState<User | null>(session()?.user || null);
  useEffect(() => {
    if (user) {
      document.documentElement.dataset.theme = user.profile.theme;
      document.documentElement.dataset.contrast = String(
        user.profile.high_contrast,
      );
    }
  }, [user]);
  return (
    <Auth.Provider value={{ user, setUser }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/servers" element={<ServerSettings />} />
          <Route
            path="/*"
            element={user ? <Shell /> : <Navigate to="/login" replace />}
          />
        </Routes>
      </BrowserRouter>
    </Auth.Provider>
  );
}
function Login() {
  const { t } = useLocale();
  const { user, setUser } = useAuth();
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("manutailor-demo");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [returnTo] = useState(() =>
    manualPathFromUrl(sessionStorage.getItem("manu-return-to") || ""),
  );
  const navigate = useNavigate();
  if (user)
    return (
      <Navigate to={returnTo || (user.role === "admin" ? "/admin" : "/app")} />
    );
  return (
    <div className="login-page">
      <div className="login-art">
        <Brand />
        <div>
          <Badge>{t("ひとりひとりに、わかりやすく。")}</Badge>
          <h1>
            {t("あなたに合う、")}
            <br />
            {t("仕事の進め方。")}
          </h1>
          <p>
            {t("いつものマニュアルを、あなたの読みやすい形に。")}
            <br />
            {t("一つずつ確認して、安心して次の一歩へ。")}
          </p>
          <div className="art-book">
            <BookOpen size={120} />
            <span>
              <Check size={30} />
            </span>
          </div>
        </div>
        <small>{t("Manu-Tailor ・ マニュ・テーラー")}</small>
      </div>
      <main className="login-panel">
        <LanguagePicker />
        <ServerTabs />
        <h2>{t("おかえりなさい")}</h2>
        <p className="muted">
          {t("ログインして、今日の手順を確認しましょう。")}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const result = await api<{
                token: string;
                user: User;
              }>("/login", {
                method: "POST",
                body: JSON.stringify({ username, password }),
              });
              localStorage.setItem("manu-session", JSON.stringify(result));
              setUser(result.user);
              const pending = manualPathFromUrl(
                sessionStorage.getItem("manu-return-to") || "",
              );
              sessionStorage.removeItem("manu-return-to");
              navigate(
                pending || (result.user.role === "admin" ? "/admin" : "/app"),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {t("ユーザー名")}
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label>
            {t("パスワード")}
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <Alert danger>{error}</Alert>}
          <Button disabled={busy} className="full">
            {busy ? t("ログイン中…") : t("ログイン")}
            <ArrowRight size={20} />
          </Button>
        </form>
        <Card>
          <strong>{t("デモを試す")}</strong>
          <p className="muted">
            {t("APIキーなしで、すべての操作を体験できます。")}
          </p>
          <div className="row">
            <Button className="secondary" onClick={() => setUsername("demo")}>
              {t("利用者")}
            </Button>
            <Button className="secondary" onClick={() => setUsername("admin")}>
              {t("管理者")}
            </Button>
          </div>
          <small>{t("共通パスワード：manutailor-demo")}</small>
        </Card>
      </main>
    </div>
  );
}
function ServerTabs() {
  const { t } = useLocale();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [servers, setServers] = useState(() => savedServers(BASE));
  const [selected, setSelected] = useState(() => activeServer(BASE)?.id);
  const [error, setError] = useState("");
  useEffect(() => watchServers(() => {
    setServers(savedServers(BASE));
    setSelected(activeServer(BASE)?.id);
  }), []);
  return (
    <div className="server-tabs-wrap">
      <div className="server-tabs" role="tablist" aria-label={t("接続先サーバー")}>
        {servers.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected === item.id}
            className={selected === item.id ? "active" : ""}
            title={item.url || window.location.origin}
            onClick={async () => {
              if (selected === item.id) return;
              try {
                if (user) {
                  try { await api("/logout", { method: "POST" }); } catch { /* Offline. */ }
                  await clearPrivateCache();
                  setUser(null);
                }
                selectServer(item.id, BASE);
                setError("");
                if (user) navigate("/login");
              } catch (cause) {
                setError((cause as Error).message);
              }
            }}
          >
            {item.name}
          </button>
        ))}
        <Link className="server-tab-add" to="/servers" aria-label={t("サーバーを追加")}>＋</Link>
      </div>
      {error && <Alert danger>{error}</Alert>}
    </div>
  );
}
function ServerSettings({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLocale();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [servers, setServers] = useState(() => savedServers(BASE));
  const [editing, setEditing] = useState<SavedServer | null>(null);
  const [message, setMessage] = useState("");
  const current = activeServer(BASE);
  const refresh = () => setServers(savedServers(BASE));
  const leaveServer = async () => {
    if (user) {
      try {
        await api("/logout", { method: "POST" });
      } catch {
        /* May be offline. */
      }
    }
    await clearPrivateCache();
    setUser(null);
  };
  const content = (
    <>
      <PageHeading title={t("サーバーの詳細設定")} />
      <p className="muted">
        {t("サーバーを切り替えると、再ログインが必要です。")}
      </p>
      <div className="settings-grid">
        <Card>
          <h2>{t("登録済みサーバー")}</h2>
          {servers.map((item) => (
            <div className="source-row" key={item.id}>
              <div>
                <strong>
                  {item.name}
                  {current?.id === item.id ? ` (${t("使用中")})` : ""}
                </strong>
                <p className="muted">{item.url}</p>
              </div>
              <div className="row">
                <Button
                  className="secondary"
                  onClick={async () => {
                    try {
                      if (current?.id !== item.id) {
                        await leaveServer();
                        selectServer(item.id, BASE);
                      }
                      navigate("/login");
                    } catch (error) {
                      setMessage((error as Error).message);
                    }
                  }}
                >
                  {t("選択")}
                </Button>
                <Button className="secondary" onClick={() => setEditing(item)}>
                  {t("編集")}
                </Button>
                <Button
                  className="secondary"
                  onClick={async () => {
                    try {
                      if (current?.id === item.id) await leaveServer();
                      removeServer(item.id, BASE);
                      refresh();
                      if (current?.id === item.id) navigate("/login");
                    } catch (error) {
                      setMessage((error as Error).message);
                    }
                  }}
                >
                  {t("削除")}
                </Button>
              </div>
            </div>
          ))}
        </Card>
        <Card>
          <h2>{editing ? t("サーバーを編集") : t("サーバーを追加")}</h2>
          <form
            key={editing?.id || "new"}
            onSubmit={async (event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const form = new FormData(formElement);
              const item = {
                id: editing?.id || crypto.randomUUID(),
                name: String(form.get("name") || ""),
                url: String(form.get("url") || ""),
              };
              try {
                const changedCurrent =
                  current?.id === item.id &&
                  current.url !== item.url.trim().replace(/\/$/, "");
                if (changedCurrent) await leaveServer();
                saveServer(item, BASE);
                refresh();
                setEditing(null);
                setMessage(t("サーバーを保存しました。"));
                if (changedCurrent) navigate("/login");
                else formElement.reset();
              } catch (error) {
                setMessage((error as Error).message);
              }
            }}
          >
            <label>
              {t("サーバー名")}
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={editing?.name || ""}
              />
            </label>
            <label>
              URL
              <input
                name="url"
                type="url"
                required
                placeholder="http://192.168.1.10:8000"
                defaultValue={editing?.url || ""}
              />
            </label>
            <Button>{t("保存")}</Button>
            {editing && (
              <Button
                className="secondary"
                type="button"
                onClick={() => setEditing(null)}
              >
                {t("キャンセル")}
              </Button>
            )}
          </form>
          {message && <Alert>{message}</Alert>}
        </Card>
      </div>
      <Link className="text-button" to={embedded ? "/admin/settings" : user ? "/app/profile" : "/login"}>
        {t("戻る")}
      </Link>
    </>
  );
  return embedded ? content : <main className="main-content">{content}</main>;
}
function Shell() {
  const { t } = useLocale();
  const { user, setUser } = useAuth();
  const [toast, setToast] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  useEffect(() => {
    let active = true;
    const poll = () =>
      api<Notice[]>("/notifications")
        .then((items) => {
          if (!active) return;
          setNotices(items);
          const seenKey = "notices:" + user?.id;
          const seen: string[] = JSON.parse(
            sessionStorage.getItem(seenKey) || "[]",
          );
          const fresh = items.filter((n) => !n.read && !seen.includes(n.id));
          if (fresh.length) {
            sessionStorage.setItem(
              seenKey,
              JSON.stringify([...seen, ...fresh.map((n) => n.id)]),
            );
            for (const n of fresh) {
              if (!navigator.serviceWorker?.controller) {
                setToast(n.title);
                setTimeout(() => setToast(""), 5000);
              }
              navigator.serviceWorker?.controller?.postMessage({
                type: "MOCK_PUSH",
                payload: {
                  id: n.id,
                  title: n.title,
                  url: n.kind === "api_limit" ? "/admin/settings" : "/app/manual/" + n.generation_id,
                },
              });
            }
          }
        })
        .catch(() => {});
    poll();
    const timer = setInterval(poll, 4000);
    const receive = (e: MessageEvent) => {
      if (e.data?.type === "MANU_NOTIFICATION") {
        setToast(e.data.payload.title);
        setTimeout(() => setToast(""), 5000);
      }
    };
    navigator.serviceWorker?.addEventListener("message", receive);
    return () => {
      active = false;
      clearInterval(timer);
      navigator.serviceWorker?.removeEventListener("message", receive);
    };
  }, [user?.id]);
  return (
    <div className={"app-shell " + (isAdmin ? "admin-shell" : "")}>
      <LanguagePicker />
      <Header>
        <Brand />
        <div className="header-actions">
          <Badge tone="neutral">
            {isAdmin ? t("管理者") : t("マイページ")}
          </Badge>
          <Button
            className="icon secondary"
            aria-label={t("通知を開く")}
            onClick={() => navigate("/app/notifications")}
          >
            <Bell size={22} />
            {notices.some((n) => !n.read) && <i />}
          </Button>
          <span className="avatar">{user?.name[0]}</span>
        </div>
      </Header>
      {isAdmin && (
        <aside className="sidebar">
          <p>{t("ワークスペース")}</p>
          <NavLink to="/admin" end>
            <LayoutDashboard />
            {t("概要")}
          </NavLink>
          <NavLink to="/admin/manuals">
            <BookOpen />
            {t("標準マニュアル")}
          </NavLink>
          <NavLink to="/admin/folders">
            <BookOpen />
            {t("フォルダとカテゴリー")}
          </NavLink>
          <NavLink to="/admin/reviews">
            <ClipboardCheck />
            {t("検品・承認")}
          </NavLink>
          <NavLink to="/admin/users">
            <Users />
            {t("利用者")}
          </NavLink>
          <NavLink to="/admin/settings">
            <Settings />
            {t("設定")}
          </NavLink>
          <div className="sidebar-note">
            <ShieldCheck />
            <strong>{t("原文とつながる安心")}</strong>
            <p>{t("検品と承認を経て、現場へ届けます。")}</p>
          </div>
        </aside>
      )}
      <main className="main-content">
        <ServerTabs />
        <Routes>
          <Route path="/app" element={<HomePage />} />
          <Route path="/app/manuals" element={<HomePage list />} />
          <Route path="/app/manual/:id" element={<ManualView />} />
          <Route path="/app/notifications" element={<Notifications />} />
          <Route path="/app/profile" element={<Preferences />} />
          <Route path="/app/profile/test" element={<PreferenceTest />} />
          <Route
            path="/admin/*"
            element={isAdmin ? <AdminRoutes /> : <Navigate to="/app" />}
          />
          <Route path="/manuals/:id" element={<ManualView />} />
          <Route path="/profile/test" element={<PreferenceTest />} />
          <Route path="/profile" element={<Preferences />} />
          <Route path="/settings" element={<Preferences />} />
          <Route
            path="*"
            element={<Navigate to={isAdmin ? "/admin" : "/app"} replace />}
          />
        </Routes>
        <footer className="page-footer">
          <span>{t("ひとりひとりの、わかりやすいを。")}</span>
          <button
            className="text-button"
            onClick={async () => {
              try {
                await api("/logout", { method: "POST" });
              } catch {
                /* Offline logout still clears cached private data. */
              }
              await clearPrivateCache();
              setUser(null);
              navigate("/login");
            }}
          >
            <LogOut size={16} />
            {t("ログアウト")}
          </button>
        </footer>
      </main>
      {!isAdmin && (
        <BottomNavigation>
          <NavLink to="/app" end>
            <Home />
            {t("ホーム")}
          </NavLink>
          <NavLink to="/app/manuals">
            <BookOpen />
            {t("マニュアル")}
          </NavLink>
          <NavLink to="/app/notifications">
            <Bell />
            {t("通知")}
          </NavLink>
          <NavLink to="/app/profile">
            <Settings />
            {t("表示設定")}
          </NavLink>
        </BottomNavigation>
      )}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
function PageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
function ManualGroups<
  T extends {
    id: string;
    folder_id: string | null;
    category_id: string | null;
    folder_name: string | null;
    category_name: string | null;
    folder_path?: { id: string; name: string }[];
  },
>({ items, renderCard, expandAll = false }: { items: T[]; renderCard: (item: T) => ReactNode; expandAll?: boolean }) {
  const { t } = useLocale();
  type FolderGroup = {
    name: string;
    children: Map<string, FolderGroup>;
    categories: Map<string, { name: string; items: T[] }>;
  };
  const groups = new Map<string, FolderGroup>();
  for (const item of items) {
    const path = item.folder_path?.length ? item.folder_path
      : [{ id: item.folder_id || "", name: item.folder_name || t("未分類") }];
    let level = groups;
    let folder: FolderGroup | undefined;
    for (const part of path) {
      if (!level.has(part.id)) level.set(part.id, { name: part.name, children: new Map(), categories: new Map() });
      folder = level.get(part.id)!;
      level = folder.children;
    }
    const categoryKey = item.category_id || "";
    if (!folder!.categories.has(categoryKey))
      folder!.categories.set(categoryKey, {
        name: item.category_name || t("カテゴリー未設定"),
        items: [],
      });
    folder!.categories.get(categoryKey)!.items.push(item);
  }
  const order = (
    [keyA, a]: [string, { name: string }],
    [keyB, b]: [string, { name: string }],
  ) => (keyA === "" ? 1 : keyB === "" ? -1 : a.name.localeCompare(b.name));
  const renderFolder = ([folderId, folder]: [string, FolderGroup]): ReactNode => (
    <details className="manual-folder" key={folderId} open={expandAll ? true : undefined}>
      <summary><BookOpen size={22} /><strong>{folder.name}</strong>
        <span className="muted">{folder.children.size}フォルダ・{folder.categories.size}カテゴリー</span><ArrowRight size={18} className="folder-chevron" /></summary>
      <div className="folder-category-list">{[...folder.children.entries()].sort(order).map(renderFolder)}</div>
      {[...folder.categories.entries()]
        .sort(order)
        .map(([categoryId, category]) => (
          <details className="manual-category" key={categoryId} open={expandAll ? true : undefined}>
            <summary><strong>{category.name}</strong><span className="muted">{category.items.length}件</span>
              <ArrowRight size={16} className="folder-chevron" /></summary>
            <div className="manual-grid">{category.items.map(renderCard)}</div>
          </details>
        ))}
    </details>
  );
  return [...groups.entries()].sort(order).map(renderFolder);
}
function folderOptions(folders: ManualFolder[] | null = []): { folder: ManualFolder; label: string }[] {
  const result: { folder: ManualFolder; label: string }[] = [];
  const children = new Map<string, ManualFolder[]>();
  for (const folder of folders || []) {
    const parent = folder.parent_id || "";
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(folder);
  }
  const visit = (parentId: string | null, depth: number, seen: Set<string>) => {
    for (const folder of children.get(parentId || "") || []) {
      if (seen.has(folder.id)) continue;
      result.push({ folder, label: `${"　".repeat(depth)}${folder.name}` });
      visit(folder.id, depth + 1, new Set([...seen, folder.id]));
    }
  };
  visit(null, 0, new Set());
  return result;
}
function HomePage({ list = false }: { list?: boolean }) {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const { data, error } = useLoad<Generation[]>("/generations");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const progress = (id: string) =>
    Number(localStorage.getItem("progress:" + user?.id + ":" + id) || 0);
  const visible = data?.filter((g) =>
    [g.title, g.folder_name, g.category_name].some((value) =>
      value?.includes(search),
    ),
  );
  return (
    <>
      <PageHeading
        eyebrow={list ? "MY MANUALS" : "YOUR WORK, YOUR PACE"}
        title={
          list
            ? t("マニュアル")
            : locale === "ja"
              ? `${user?.name.split(" ")[0]}さん、こんにちは。`
              : `${t("こんにちは。")} ${user?.name.split(" ")[0]}`
        }
      />
      {!list && (
        <div className="hero">
          <div>
            <Badge>
              <Sparkles size={15} />
              {t("あなたに合う手順で")}
            </Badge>
            <h2>
              {t("ひとつずつ。")}
              <br />
              {t("自分のペースで、確実に。")}
            </h2>
            <p>{t("今日の作業も、わかりやすい手順と一緒に。")}</p>
            <Link className="button" to="/app/profile/test">
              {t("表示の好みをチェック")}
              <ArrowRight size={18} />
            </Link>
          </div>
          <div className="hero-illustration" aria-hidden="true">
            <div className="paper">
              <span />
              <span />
              <div>
                <Check />
                {t("確認する")}
              </div>
              <span />
              <div>
                <Check />
                {t("次へ進む")}
              </div>
            </div>
            <div className="floating-check">
              <Check size={32} />
            </div>
          </div>
        </div>
      )}
      {list && (
        <label className="search">
          <Search />
          <input
            aria-label={t("マニュアルを検索")}
            placeholder={t("マニュアルを検索")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      )}
      {error && (
        <Alert>
          {error}
          {t("オフライン時は、最近開いたマニュアルのURLから閲覧できます。")}
        </Alert>
      )}
      {!data && !error && <Skeleton />}
      {!list &&
        data?.some(
          (g) => progress(g.id) > 0 && progress(g.id) < g.blocks.length,
        ) && (
          <>
            <div className="section-heading">
              <h2>{t("続きから")}</h2>
              <span className="muted">{t("前回の手順を覚えています")}</span>
            </div>
            {data
              .filter(
                (g) => progress(g.id) > 0 && progress(g.id) < g.blocks.length,
              )
              .map((g) => (
                <ManualCard
                  key={g.id}
                  title={g.title}
                  count={g.blocks.length}
                  safety={g.mode === "safety"}
                  progress={progress(g.id)}
                  onClick={() => navigate("/app/manual/" + g.id)}
                />
              ))}
          </>
        )}
      <div className="section-heading">
        <h2>{list ? t("すべてのマニュアル") : t("届いているマニュアル")}</h2>
        <Badge tone="neutral">
          {visible?.length || 0}
          {t("件")}
        </Badge>
      </div>
      {visible && (
        <ManualGroups
          items={visible}
          expandAll={Boolean(search)}
          renderCard={(g) => (
            <ManualCard
              key={g.id}
              title={g.title}
              count={g.blocks.length}
              safety={g.mode === "safety"}
              onClick={() => navigate("/app/manual/" + g.id)}
            />
          )}
        />
      )}
      {visible?.length === 0 && (
        <EmptyState>{t("公開されたマニュアルがここに届きます。")}</EmptyState>
      )}
      {!list && (
        <div className="hint-row">
          <ShieldCheck />
          <p>
            {t("わからないときは「原文を確認」。")}
            <br />
            <span className="muted">
              {t("いつでも、元のマニュアルに戻れます。")}
            </span>
          </p>
        </div>
      )}
    </>
  );
}
function Notifications() {
  const { t } = useLocale();
  const { data, error, reload } = useLoad<Notice[]>("/notifications");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  return (
    <>
      <PageHeading eyebrow="NOTIFICATIONS" title={t("あなたへのお知らせ")} />
      <Card>
        <div className="row spread">
          <div>
            <strong>{t("新しい手順を、見逃さずに")}</strong>
            <p className="muted">{t("通知から、マニュアルを直接開けます。")}</p>
          </div>
          <Button
            onClick={() =>
              notificationProvider()
                .register()
                .then(setMessage)
                .catch((e) => setMessage(e.message))
            }
          >
            <Bell size={20} />
            {t("通知を有効にする")}
          </Button>
        </div>
        {message && <Alert>{message}</Alert>}
      </Card>
      {error && <Alert danger>{error}</Alert>}
      <div className="notice-list">
        {data?.map((n) => (
          <button
            key={n.id}
            className={"notice " + (!n.read ? "unread" : "")}
            onClick={async () => {
              await api("/notifications/" + n.id + "/read", { method: "POST" });
              reload();
              navigate(n.kind === "api_limit" ? "/admin/settings" : "/app/manual/" + n.generation_id);
            }}
          >
            <span className="manual-icon">
              <Bell />
            </span>
            <span>
              <strong>{n.title}</strong>
              <span className="muted">
                {new Date(n.created_at).toLocaleString("ja-JP")}
              </span>
            </span>
            <ArrowRight />
          </button>
        ))}
      </div>
      {data?.length === 0 && (
        <EmptyState>{t("今のところ、新しいお知らせはありません。")}</EmptyState>
      )}
    </>
  );
}
function ProtectedImage({ filename }: { filename: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let objectUrl = "";
    let active = true;
    cacheFile(filename)
      .then((blob) => {
        if (active) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [filename]);
  return url ? (
    <img className="source-image" src={url} alt="原文に含まれる図" />
  ) : (
    <p className="muted">図を読み込み中</p>
  );
}
function SourceBlockEditor({ manualId, block, nextBlock, onSaved }: {
  manualId: string;
  block: ManualDocument["blocks"][number];
  nextBlock?: ManualDocument["blocks"][number];
  onSaved: () => void;
}) {
  const [kind, setKind] = useState(block.kind || "step");
  const [stepLabel, setStepLabel] = useState(block.step_label || "");
  const [tags, setTags] = useState((block.tags || []).join("、"));
  const [sourceText, setSourceText] = useState(block.source_text);
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeText, setMergeText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setKind(block.kind || "step");
    setStepLabel(block.step_label || "");
    setTags((block.tags || []).join("、"));
    setSourceText(block.source_text);
  }, [block.kind, block.step_label, block.tags, block.source_text]);
  const label = { step: "手順", warning: "注意", request: "お願い", other: "その他" }[kind];
  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      await api(`/manuals/${manualId}/blocks/${block.id}`, {
        method: "PUT",
        body: JSON.stringify({ source_text: sourceText, kind,
          step_label: kind === "step" ? stepLabel.trim() || null : null,
          tags: tags.split(/[、,]/).map((tag) => tag.trim()).filter(Boolean) }),
      });
      setEditing(false);
      onSaved();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const saveMerge = async () => {
    if (!nextBlock) return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/manuals/${manualId}/blocks/merge`, {
        method: "POST",
        body: JSON.stringify({ first_id: block.id, second_id: nextBlock.id, source_text: mergeText }),
      });
      setMerging(false);
      onSaved();
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="source-row">
    <span>{(block.kind || "step") === "step" ? block.step_label || "•" : "•"}</span>
    <div className="source-body">
      <div className="source-tags"><strong>{label}</strong>{(block.tags || []).filter((tag) => tag !== label).map((tag) => <Badge key={tag}>{tag}</Badge>)}</div>
      {merging ? <>
        <label>連結後の文章
          <textarea value={mergeText} onChange={(event) => setMergeText(event.target.value)} rows={5} />
        </label>
        <p className="muted">保存すると、分類と自動タグを付け直します。</p>
        <div className="source-actions"><Button disabled={busy || !mergeText.trim()} onClick={saveMerge}>連結して保存</Button>
          <button onClick={() => setMerging(false)}>キャンセル</button></div>
      </> : editing ? <>
        <textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} rows={4} aria-label="原文" />
        <label>分類<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
          <option value="step">手順</option><option value="warning">注意</option>
          <option value="request">お願い</option><option value="other">その他</option>
        </select></label>
        {kind === "step" && <label>手順番号・記号（番号なしなら空欄）
          <input value={stepLabel} maxLength={20} onChange={(event) => setStepLabel(event.target.value)}
            placeholder="例: 1、①、A" />
        </label>}
        <label>タグ（読点で区切って追加）<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="例: 清掃、安全" /></label>
        <div className="source-actions"><Button disabled={busy || !sourceText.trim()} onClick={save}>保存</Button><button onClick={() => setEditing(false)}>キャンセル</button></div>
      </> : <>{block.heading && block.heading !== "手順" && <strong>{block.heading}</strong>}
        <p style={{ whiteSpace: "pre-wrap" }}>{block.source_text}</p><div className="source-actions">
        <button className="source-edit" onClick={() => setEditing(true)}>分類・タグを編集</button>
        {nextBlock && nextBlock.source_page === block.source_page &&
          <button className="source-edit" onClick={() => {
            setMergeText(block.source_text.trim() +
              (/^(お願い|注意|警告|危険|禁止)$/.test(block.source_text.trim()) ? "\n" : "") +
              nextBlock.source_text.trim());
            setMerging(true);
          }}>次の項目と連結</button>}
      </div></>}
      {message && <Alert danger>{message}</Alert>}
    </div>
  </div>;
}
function ManualImageEditor({
  manualId,
  image,
  onSaved,
}: {
  manualId: string;
  image: ManualDocument["images"][number];
  onSaved: () => void;
}) {
  const [tags, setTags] = useState((image.tags || []).join("、"));
  const [crop, setCrop] = useState({ left: 0, top: 0, right: 100, bottom: 100 });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (cut: boolean) => {
    setBusy(true);
    setMessage("");
    try {
      await api(`/manuals/${manualId}/images/${image.id}`, {
        method: "PUT",
        body: JSON.stringify({
          tags: tags.split(/[、,]/).map((tag) => tag.trim()).filter(Boolean),
          crop: cut ? Object.fromEntries(
            Object.entries(crop).map(([side, value]) => [side, value / 100]),
          ) : null,
        }),
      });
      onSaved();
      setMessage("図を新しい原文バージョンに保存しました。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="manual-image-editor">
      <div className="crop-preview">
        <ProtectedImage filename={image.image_path} />
        <span
          className="crop-selection"
          aria-hidden="true"
          style={{
            left: `${crop.left}%`, top: `${crop.top}%`,
            width: `${Math.max(0, crop.right - crop.left)}%`,
            height: `${Math.max(0, crop.bottom - crop.top)}%`,
          }}
        />
      </div>
      <p className="muted">ページ {image.page} の図</p>
      <label>
        図のタグ（読点で区切る）
        <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="例：電源、操作パネル" />
      </label>
      <Button className="secondary" disabled={busy} onClick={() => save(false)}>タグを保存</Button>
      <details>
        <summary className="text-button">図を切り抜く</summary>
        <p className="muted">元画像に対する割合を指定します。左・上は開始位置、右・下は終了位置です。</p>
        <div className="crop-fields">
          {(["left", "top", "right", "bottom"] as const).map((side) => (
            <label key={side}>
              {{ left: "左から", top: "上から", right: "右まで", bottom: "下まで" }[side]} (%)
              <input
                type="number" min="0" max="100" step="1"
                value={crop[side]}
                onChange={(event) => setCrop({ ...crop, [side]: Number(event.target.value) })}
              />
            </label>
          ))}
        </div>
        <Button disabled={busy} onClick={() => save(true)}>画像を切り抜いて保存</Button>
      </details>
      {message && <Alert>{message}</Alert>}
    </div>
  );
}
function ManualView() {
  const { t } = useLocale();
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [manual, setManual] = useState<Generation | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<Block | null>(null);
  const [all, setAll] = useState(false);
  const [finished, setFinished] = useState(false);
  const [font, setFont] = useState(user?.profile.font_scale || 1.1);
  const navigate = useNavigate();
  useEffect(() => {
    cachedManual(id)
      .then(({ manual, offline }) => {
        setManual(manual);
        setOffline(offline);
        setStep(
          Math.min(
            Number(
              localStorage.getItem("progress:" + user?.id + ":" + id) || 0,
            ),
            manual.blocks.length - 1,
          ),
        );
        if (!offline) {
          for (const image of manual.document.images)
            void cacheFile(image.image_path).catch(() => {});
          if (manual.source_file)
            void cacheFile(manual.source_file).catch(() => {});
        }
      })
      .catch((e) => setError(e.message));
    const online = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine)
        cachedManual(id)
          .then((r) => setManual(r.manual))
          .catch(() => {});
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      speechSynthesis?.cancel();
    };
  }, [id, user?.id]);
  if (error) return <Alert danger>{error}</Alert>;
  if (!manual) return <Skeleton />;
  const blocked = manual.mode === "safety" && (offline || manual.stale);
  const pageSize = user?.profile.steps_per_screen || 1;
  const speak = (text: string) => {
    speechSynthesis.cancel();
    const voice = new SpeechSynthesisUtterance(text);
    voice.lang = "ja-JP";
    voice.rate = user?.profile.speech_rate || 0.9;
    speechSynthesis.speak(voice);
  };
  const renderBlock = (b: Block) => (
    <StepCard key={b.id}>
      <div className="step-label">
        {(b.tags || ["手順"]).includes("手順")
          ? b.step_label ? `STEP ${b.step_label}` : "手順"
          : (b.tags || ["その他"])[0]}
      </div>
      {(b.tags || []).filter((tag) => tag !== "手順").map((tag) => <Badge key={tag}>{tag}</Badge>)}
      {(user?.profile.prefer_images ?? true) &&
        manual.document.images
          .filter((i) => b.image_ids.includes(i.id))
          .map((i) => <ProtectedImage key={i.id} filename={i.image_path} />)}
      {b.image_ids.length === 0 && manual.profile.visual_support > 0.7 && b.step_label && (b.tags || ["手順"]).includes("手順") && (
        <div className="step-symbol" aria-label={t("手順番号")}>
          <ClipboardCheck size={44} />
          <span>{b.step_label}</span>
        </div>
      )}
      <button
        className="instruction"
        aria-label={b.generated_text}
        style={{
          fontSize: `${1.35 * font}rem`,
          lineHeight: user?.profile.line_spacing || 1.7,
          maxWidth: `${(user?.profile.max_sentence_chars || 40) / 2}em`,
        }}
        onClick={() => {
          setSource(b);
          recordPresentationEvent(user!.profile, "source");
        }}
      >
        <PresentationText text={b.generated_text} profile={user!.profile} />
      </button>
      {user?.profile.prefer_images === false &&
        manual.document.images
          .filter((i) => b.image_ids.includes(i.id))
          .map((i) => <ProtectedImage key={i.id} filename={i.image_path} />)}
      <div
        className={
          user?.profile.highlight_warnings === false
            ? undefined
            : "emphasized-warnings"
        }
      >
        {b.warnings.map((w, i) => (
          <Alert danger key={i}>
            {w}
          </Alert>
        ))}
      </div>
      <div className="row wrap">
        <Button
          className="secondary"
          onClick={() => {
            setSource(b);
            recordPresentationEvent(user!.profile, "source");
          }}
        >
          <FileText size={19} />
          {t("原文を確認")}
        </Button>
        <Button className="secondary" onClick={() => speak(b.generated_text)}>
          <Volume2 size={19} />
          {t("読み上げ")}
        </Button>
      </div>
      <details className="reason">
        <summary>{t("この表示になった理由")}</summary>
        <p>{b.reason}</p>
      </details>
    </StepCard>
  );
  return (
    <div className="manual-view">
      <button className="text-button" onClick={() => navigate("/app/manuals")}>
        <ArrowLeft size={18} />
        {t("マニュアル一覧")}
      </button>
      <div className="manual-title">
        <h1>{manual.title}</h1>
        <Badge tone={manual.mode === "safety" ? "orange" : "blue"}>
          {manual.mode === "safety" ? (
            <ShieldCheck size={16} />
          ) : (
            <CheckCircle2 size={16} />
          )}{" "}
          {manual.mode === "safety" ? t("安全性重視") : t("承認済み")}
        </Badge>
      </div>
      {user?.profile.language !== "ja" &&
        user?.profile.language !== "ja-easy" && (
          <Alert>
            {t(
              "このマニュアルは選んだ言語へ翻訳されていません。原文を読めない場合は、管理者に翻訳版を依頼してください。",
            )}
          </Alert>
        )}
      {(offline || manual.stale) && (
        <Alert danger={blocked}>
          {blocked
            ? t(
                "安全性重視のため、通信と最新版を確認するまで作業を進められません。",
              )
            : t(
                "このマニュアルは最新版ではない可能性があります。保存済みの原文を表示しています。",
              )}
        </Alert>
      )}
      <div className="step-progress">
        <strong>
          {finished ? t("完了") : `${step + 1} / ${manual.blocks.length}`}
        </strong>
        <span>{t("一つずつ、確認しましょう")}</span>
        <Progress
          value={finished ? manual.blocks.length : step + 1}
          max={manual.blocks.length}
        />
      </div>
      <div className="reader-tools">
        <button
          onClick={() => setFont(Math.max(1, font - 0.1))}
          aria-label={t("文字を小さく")}
        >
          A−
        </button>
        <button
          onClick={() => {
            setFont(Math.min(1.6, font + 0.1));
            recordPresentationEvent(
              user!.profile,
              "font",
              Math.min(1.6, font + 0.1),
            );
          }}
          aria-label={t("文字を大きく")}
        >
          A＋
        </button>
        <button onClick={() => setAll(!all)}>
          {all ? t("1ステップ表示") : t("全体表示")}
        </button>
        <button
          onClick={() =>
            speechSynthesis.paused
              ? speechSynthesis.resume()
              : speechSynthesis.pause()
          }
          aria-label={t("読み上げを一時停止・再開")}
        >
          <Pause size={18} />
        </button>
        <button
          onClick={() => speechSynthesis.cancel()}
          aria-label={t("読み上げを停止")}
        >
          <Square size={18} />
        </button>
      </div>
      {finished ? (
        <Card className="completion">
          <CheckCircle2 size={64} />
          <h2>{t("おつかれさまでした。")}</h2>
          <p>{t("すべての手順を確認しました。")}</p>
          <Button onClick={() => navigate("/app")}>{t("ホームへ戻る")}</Button>
        </Card>
      ) : all ? (
        manual.blocks.map(renderBlock)
      ) : (
        manual.blocks
          .slice(step, step + pageSize)
          .map((b) => renderBlock(b))
      )}
      {!finished && (
        <div className="step-navigation">
          <Button
            className="secondary"
            disabled={step === 0}
            onClick={() => {
              recordPresentationEvent(user!.profile, "back");
              setStep(Math.max(0, step - pageSize));
              localStorage.setItem(
                "progress:" + user?.id + ":" + id,
                String(Math.max(0, step - pageSize)),
              );
              speechSynthesis.cancel();
            }}
          >
            <ArrowLeft size={20} />
            {t("戻る")}
          </Button>
          <Button
            disabled={blocked}
            onClick={async () => {
              if (manual.mode === "safety") {
                try {
                  const latest = await api<Generation>("/generations/" + id);
                  setManual(latest);
                  if (latest.stale) return;
                } catch {
                  setOffline(true);
                  return;
                }
              }
              speechSynthesis.cancel();
              const next = Math.min(manual.blocks.length, step + pageSize);
              localStorage.setItem(
                "progress:" + user?.id + ":" + id,
                String(next),
              );
              if (next === manual.blocks.length) setFinished(true);
              else setStep(next);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            {step + pageSize >= manual.blocks.length
              ? t("完了する")
              : t("次へ")}
            <ArrowRight size={20} />
          </Button>
        </div>
      )}
      {source && (
        <BottomSheet
          title={t("元のマニュアル")}
          onClose={() => setSource(null)}
        >
          {[...new Set(source.source_block_ids.map((sourceId) =>
            manual.document.blocks.find((b) => b.id === sourceId)?.source_page
          ).filter((page): page is number => page !== undefined))].map((page) => {
            const raw = manual.document.raw_pages?.find((item) => item.page === page);
            return raw ? (
              <div key={page}>
                <Badge tone="neutral">{t("ページ")}{page}</Badge>
                <blockquote style={{ whiteSpace: "pre-wrap" }}>{raw.text}</blockquote>
              </div>
            ) : null;
          })}
          {!manual.document.raw_pages?.length && source.source_block_ids.map((sourceId) => {
            const original = manual.document.blocks.find(
              (b) => b.id === sourceId,
            );
            return (
              original && (
                <div key={sourceId}>
                  <Badge tone="neutral">
                    {t("ページ")}
                    {original.source_page}
                    {t("/ 手順")}
                    {original.source_block}
                  </Badge>
                  <blockquote>
                    <mark>{original.source_text}</mark>
                  </blockquote>
                </div>
              )
            );
          })}
          <p className="muted">
            {t("原文バージョン")}
            {manual.version}
            {t("・ 確認後は同じ手順に戻ります。")}
          </p>
          {manual.source_file && (
            <Button
              className="secondary"
              onClick={async () => {
                try {
                  const blob = await cacheFile(manual.source_file!);
                  const url = URL.createObjectURL(blob);
                  window.open(
                    url +
                      (manual.source_file?.endsWith(".pdf")
                        ? "#page=" +
                          manual.document.blocks.find(
                            (b) => b.id === source.source_block_ids[0],
                          )?.source_page
                        : ""),
                    "_blank",
                    "noopener",
                  );
                  setTimeout(() => URL.revokeObjectURL(url), 60000);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {t("元ファイルで見る")}
              <FileText size={18} />
            </Button>
          )}
        </BottomSheet>
      )}
    </div>
  );
}
async function saveProfile(
  profile: Profile,
  user: User,
  setUser: (u: User) => void,
) {
  const saved = await api<Profile>("/profile", {
    method: "PUT",
    body: JSON.stringify(profile),
  });
  const updated = { ...user, profile: saved };
  localStorage.setItem(
    "manu-session",
    JSON.stringify({ ...session(), user: updated }),
  );
  setUser(updated);
}
function Preferences() {
  const { t } = useLocale();
  const { user, setUser } = useAuth();
  const location = useLocation();
  const [profile, setProfile] = useState<Profile>(
    location.state?.recommended || user!.profile,
  );
  const [message, setMessage] = useState("");
  return (
    <>
      <PageHeading eyebrow="MAKE IT YOURS" title={t("あなたに合う表示に")} />
      <p>
        <Link className="text-button" to="/servers">
          {t("サーバーの詳細設定")}
        </Link>
      </p>
      <div className="settings-grid">
        <Card>
          <h2>{t("読みやすさを選ぶ")}</h2>
          <label>
            {t("文字の大きさ")}
            <select
              value={profile.font_scale}
              onChange={(e) =>
                setProfile({ ...profile, font_scale: Number(e.target.value) })
              }
            >
              <option value="1">{t("標準")}</option>
              <option value="1.2">{t("大きめ")}</option>
              <option value="1.4">{t("もっと大きく")}</option>
              <option value="1.6">{t("最大")}</option>
            </select>
          </label>
          <label>
            {t("一度に表示する情報")}
            <select
              value={profile.step_granularity}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  step_granularity: Number(e.target.value),
                })
              }
            >
              <option value="1">{t("少なめ・細かな手順")}</option>
              <option value="0.8">{t("標準")}</option>
              <option value="0.3">{t("多め")}</option>
            </select>
          </label>
          <label>
            {t("説明のスタイル")}
            <select
              value={profile.preferred_information_style}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  preferred_information_style: e.target
                    .value as Profile["preferred_information_style"],
                  visual_support:
                    e.target.value === "visual"
                      ? 1
                      : e.target.value === "text"
                        ? 0.1
                        : 0.7,
                })
              }
            >
              <option value="text">{t("文章中心")}</option>
              <option value="balanced">{t("図と文章")}</option>
              <option value="visual">{t("図を多め")}</option>
            </select>
          </label>
          <label>
            {t("文章の長さ")}
            <select
              value={profile.preferred_sentence_length}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  preferred_sentence_length: e.target.value as
                    "short" | "normal",
                })
              }
            >
              <option value="short">{t("短い文章")}</option>
              <option value="normal">{t("元の文章量")}</option>
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={profile.high_contrast}
              onChange={(e) =>
                setProfile({ ...profile, high_contrast: e.target.checked })
              }
            />
            {t("コントラストを高くする")}
          </label>
          <label>
            {t("画面の明るさ")}
            <select
              value={profile.theme}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  theme: e.target.value as "light" | "dark",
                })
              }
            >
              <option value="light">{t("ライト")}</option>
              <option value="dark">{t("ダーク")}</option>
            </select>
          </label>
          <label>
            {t("読み上げ速度")}
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.1"
              value={profile.speech_rate}
              onChange={(e) =>
                setProfile({ ...profile, speech_rate: Number(e.target.value) })
              }
            />
            {profile.speech_rate}
            {t("倍")}
          </label>
          <Button
            onClick={() =>
              saveProfile(profile, user!, setUser)
                .then(() =>
                  setMessage(
                    t(
                      "設定を保存しました。次の個別生成から文章の設定が反映されます。",
                    ),
                  ),
                )
                .catch((e) => setMessage(e.message))
            }
          >
            {t("設定を保存")}
            <Check size={18} />
          </Button>
          {message && <Alert>{message}</Alert>}
        </Card>
        <div>
          <Card className="preview">
            <Badge>{t("プレビュー")}</Badge>
            <div
              style={{
                fontSize: `${profile.font_scale}rem`,
                color: profile.high_contrast ? "#000" : undefined,
              }}
            >
              {profile.visual_support > 0.7 && <BookOpen size={64} />}
              <h2>{t("原稿をセットする")}</h2>
              <p>
                {profile.preferred_sentence_length === "short"
                  ? t("原稿を置いてください。\nカバーを閉じてください。")
                  : t(
                      "原稿を印に合わせて置いてから、カバーをゆっくり閉じてください。",
                    )}
              </p>
              <Button>
                {t("次へ")}
                <ArrowRight size={20} />
              </Button>
            </div>
          </Card>
          <PresentationSettings profile={profile} onChange={setProfile} />
          <Link className="text-button" to="/app/profile/test">
            {t("表示の好みをもう一度チェック")}
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </>
  );
}
function PreferenceTest() {
  const { user, setUser } = useAuth();
  return (
    <AdaptiveAssessment
      onApply={(p) => {
        const next = { ...user!, profile: p };
        setUser(next);
        const old = session();
        if (old)
          localStorage.setItem(
            "manu-session",
            JSON.stringify({ ...old, user: next }),
          );
      }}
    />
  );
}
function AdminSettingsLayout() {
  const { t } = useLocale();
  return <>
    <PageHeading title={t("設定")} />
    <nav className="row wrap settings-nav" aria-label={t("設定")}>
      <NavLink to="ai" className={({ isActive }) => `button ${isActive ? "" : "secondary"}`}>
        {t("AI設定・監査")}
      </NavLink>
      <NavLink to="servers" className={({ isActive }) => `button ${isActive ? "" : "secondary"}`}>
        {t("サーバーの詳細設定")}
      </NavLink>
      <NavLink to="usability" className={({ isActive }) => `button ${isActive ? "" : "secondary"}`}>
        {t("表示と使いやすさ")}
      </NavLink>
    </nav>
    <Outlet />
  </>;
}
function AdminRoutes() {
  return (
    <Routes>
      <Route index element={<AdminDashboard />} />
      <Route path="manuals" element={<AdminManuals />} />
      <Route path="manuals/new" element={<NewManual />} />
      <Route path="manuals/:id" element={<AdminManualDetail />} />
      <Route path="folders" element={<AdminFolders />} />
      <Route path="reviews" element={<Reviews />} />
      <Route path="generations" element={<Reviews />} />
      <Route path="users" element={<AdminUsers />} />
      <Route path="users/:id/assessment" element={<AssessmentDebug />} />
      <Route path="question-bank" element={<QuestionBank />} />
      <Route path="settings" element={<AdminSettingsLayout />}>
        <Route index element={<Navigate to="ai" replace />} />
        <Route path="ai" element={<AdminSettings />} />
        <Route path="servers" element={<ServerSettings embedded />} />
        <Route path="usability" element={<Preferences />} />
      </Route>
    </Routes>
  );
}
function AdminDashboard() {
  const { data: manuals } = useLoad<any[]>("/manuals");
  const { data: generations } = useLoad<Generation[]>("/generations");
  return (
    <>
      <PageHeading
        eyebrow="WORKSPACE OVERVIEW"
        title="わかりやすい手順を、現場へ。"
      >
        <Link className="button" to="/admin/manuals/new">
          <Plus size={20} />
          マニュアルを登録
        </Link>
      </PageHeading>
      <p className="muted">
        標準マニュアルから、一人ひとりに合う伝え方をつくります。
      </p>
      <div className="stats">
        <Card>
          <span>標準マニュアル</span>
          <strong>
            {manuals?.length || 0}
            <small>件</small>
          </strong>
          <BookOpen />
        </Card>
        <Card>
          <span>確認・承認待ち</span>
          <strong>
            {generations?.filter((g) => g.status === "NEEDS_REVIEW").length ||
              0}
            <small>件</small>
          </strong>
          <ClipboardCheck />
        </Card>
        <Card>
          <span>公開済み</span>
          <strong>
            {generations?.filter((g) => g.status === "PUBLISHED").length || 0}
            <small>件</small>
          </strong>
          <CheckCircle2 />
        </Card>
      </div>
      <div className="section-heading">
        <h2>届けるまでの3ステップ</h2>
        <Badge>原文を大切に</Badge>
      </div>
      <div className="process-grid">
        {[
          {
            icon: <Users />,
            title: "好みを知る",
            text: "短い文章、図、大きい文字。利用者に合う表示を設定。",
            url: "/admin/users",
          },
          {
            icon: <Upload />,
            title: "マニュアルを登録",
            text: "PDF・画像・文章を取り込み、元の手順を整理。",
            url: "/admin/manuals/new",
          },
          {
            icon: <Sparkles />,
            title: "個別化して届ける",
            text: "生成・検品・承認を経て、通知と一緒に公開。",
            url: "/admin/reviews",
          },
        ].map((p, i) => (
          <Link to={p.url} className="card process" key={p.title}>
            <span className="process-number">0{i + 1}</span>
            {p.icon}
            <h3>{p.title}</h3>
            <p>{p.text}</p>
            <span className="text-button">
              確認する
              <ArrowRight size={18} />
            </span>
          </Link>
        ))}
      </div>
      <Card className="safety-note">
        <ShieldCheck size={36} />
        <div>
          <h3>原文と生成結果を、いつでも照合。</h3>
          <p>
            数値・警告・手順の検品結果を確認してから公開できます。安全性重視モードでは、承認済みの最新版を使用します。
          </p>
        </div>
      </Card>
    </>
  );
}
function AdminFolders() {
  const { data: folders, error, reload } = useLoad<ManualFolder[]>("/taxonomy");
  const [folderId, setFolderId] = useState("");
  const [parentId, setParentId] = useState("");
  const [message, setMessage] = useState("");
  const options = folderOptions(folders);
  const renderFolder = (folder: ManualFolder, depth = 0): ReactNode => (
    <details className="manual-folder" key={folder.id} style={{ marginLeft: depth ? 18 : 0 }}>
      <summary><BookOpen size={22} /><strong>{folder.name}</strong>
        <span className="muted">{folder.categories.length}カテゴリー</span>
        <ArrowRight size={18} className="folder-chevron" /></summary>
      <div className="folder-category-list">
        <label>入れるフォルダ
          <select value={folder.parent_id || ""} onChange={async (event) => {
            try {
              await api(`/folders/${folder.id}`, { method: "PUT",
                body: JSON.stringify({ parent_id: event.target.value || null }) });
              reload(); setMessage("フォルダを移動しました。");
            } catch (cause) { setMessage((cause as Error).message); reload(); }
          }}>
            <option value="">最上位</option>
            {options.filter((item) => item.folder.id !== folder.id).map(({ folder: candidate, label }) =>
              <option key={candidate.id} value={candidate.id}>{label}</option>)}
          </select>
        </label>
        {folder.categories.map((category) => <p key={category.id}>{category.name}</p>)}
        {folders?.filter((item) => item.parent_id === folder.id).map((item) => renderFolder(item, depth + 1))}
      </div>
    </details>
  );
  return (
    <>
      <PageHeading title="フォルダとカテゴリー" />
      <p className="muted">
        フォルダの中にフォルダやカテゴリーを作り、マニュアルを整理します。
      </p>
      <div className="settings-grid">
        <Card>
          <h2>フォルダを追加</h2>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              try {
                await api("/folders", {
                  method: "POST",
                  body: JSON.stringify({
                    name: new FormData(form).get("name"),
                    parent_id: parentId || null,
                  }),
                });
                form.reset();
                reload();
                setMessage("フォルダを追加しました。");
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            <label>
              フォルダ名
              <input name="name" required maxLength={80} />
            </label>
            <label>入れるフォルダ
              <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
                <option value="">最上位</option>
                {options.map(({ folder, label }) => <option key={folder.id} value={folder.id}>{label}</option>)}
              </select>
            </label>
            <Button>追加</Button>
          </form>
        </Card>
        <Card>
          <h2>カテゴリーを追加</h2>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              try {
                await api(`/folders/${folderId}/categories`, {
                  method: "POST",
                  body: JSON.stringify({
                    name: new FormData(form).get("name"),
                  }),
                });
                form.reset();
                reload();
                setMessage("カテゴリーを追加しました。");
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            <label>
              入れるフォルダ
              <select
                required
                value={folderId}
                onChange={(event) => setFolderId(event.target.value)}
              >
                <option value="">選んでください</option>
                {options.map(({ folder, label }) => (
                  <option key={folder.id} value={folder.id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              カテゴリー名
              <input name="name" required maxLength={80} />
            </label>
            <Button disabled={!folderId}>追加</Button>
          </form>
        </Card>
      </div>
      {error && <Alert danger>{error}</Alert>}
      {message && <Alert>{message}</Alert>}
      {folders?.filter((folder) => !folder.parent_id).map((folder) => renderFolder(folder))}
    </>
  );
}
function AdminManuals() {
  const { data, error, reload } = useLoad<ManualRecord[]>("/manuals");
  const { data: folders, reload: reloadFolders } = useLoad<ManualFolder[]>("/taxonomy");
  const { folderById, childrenByParent } = useMemo(() => {
    const folderById = new Map<string, ManualFolder>((folders || []).map((folder) => [folder.id, folder]));
    const childrenByParent = new Map<string, ManualFolder[]>();
    for (const folder of folders || []) {
      const parent = folder.parent_id && folderById.has(folder.parent_id) ? folder.parent_id : "";
      if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
      childrenByParent.get(parent)!.push(folder);
    }
    return { folderById, childrenByParent };
  }, [folders]);
  const { manualsByFolder, manualsByCategory } = useMemo(() => {
    const manualsByFolder = new Map<string, ManualRecord[]>();
    const manualsByCategory = new Map<string, ManualRecord[]>();
    for (const manual of data || []) {
      const folderId = manual.folder_id || "";
      if (!manualsByFolder.has(folderId)) manualsByFolder.set(folderId, []);
      manualsByFolder.get(folderId)!.push(manual);
      if (manual.category_id) {
        if (!manualsByCategory.has(manual.category_id)) manualsByCategory.set(manual.category_id, []);
        manualsByCategory.get(manual.category_id)!.push(manual);
      }
    }
    return { manualsByFolder, manualsByCategory };
  }, [data]);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [bulk, setBulk] = useState<{ title: string; detail: string; operationId: string } | null>(null);
  const [bulkMessage, setBulkMessage] = useState("");
  const location = useLocation();
  const folderAncestors = (id: string): string[] => {
    const ancestors: string[] = [];
    let parent = folderById.get(id)?.parent_id;
    while (parent && !ancestors.includes(parent)) {
      ancestors.push(parent);
      parent = folderById.get(parent)?.parent_id;
    }
    return ancestors;
  };
  const folderDescendants = (id: string): string[] => {
    const ids = [id];
    for (let index = 0; index < ids.length; index++)
      for (const child of childrenByParent.get(ids[index]) || [])
        if (!ids.includes(child.id)) ids.push(child.id);
    return ids;
  };
  const toggleFolder = (id: string) => {
    const descendants = folderDescendants(id);
    const categories = descendants.flatMap((folderId) =>
      (folderById.get(folderId)?.categories || []).map((category) => category.id));
    const manuals = descendants.flatMap((folderId) =>
      (manualsByFolder.get(folderId) || []).map((manual) => manual.id));
    if (selectedFolders.includes(id)) {
      setSelectedFolders((current) => current.filter((item) => !descendants.includes(item) && !folderAncestors(id).includes(item)));
      setSelectedCategories((current) => current.filter((item) => !categories.includes(item)));
      setSelected((current) => current.filter((item) => !manuals.includes(item)));
    } else {
      setSelectedFolders((current) => [...new Set([...current, ...descendants])]);
      setSelectedCategories((current) => [...new Set([...current, ...categories])]);
      setSelected((current) => [...new Set([...current, ...manuals])]);
    }
  };
  const toggleCategory = (folderId: string, id: string) => {
    const manuals = (manualsByCategory.get(id) || []).map((manual) => manual.id);
    if (selectedCategories.includes(id)) {
      setSelectedCategories((current) => current.filter((item) => item !== id));
      setSelectedFolders((current) => current.filter((item) => item !== folderId && !folderAncestors(folderId).includes(item)));
      setSelected((current) => current.filter((item) => !manuals.includes(item)));
    } else {
      setSelectedCategories((current) => [...current, id]);
      setSelected((current) => [...new Set([...current, ...manuals])]);
    }
  };
  const toggleManual = (item: ManualRecord) => {
    if (selected.includes(item.id)) {
      setSelected((current) => current.filter((id) => id !== item.id));
      if (item.category_id) setSelectedCategories((current) => current.filter((id) => id !== item.category_id));
      if (item.folder_id) setSelectedFolders((current) => current.filter((id) =>
        id !== item.folder_id && !folderAncestors(item.folder_id!).includes(id)));
    } else setSelected((current) => [...current, item.id]);
  };
  const selectionCount = selected.length + selectedFolders.length + selectedCategories.length;
  const runDelete = async () => {
    if (!selectionCount || deleting) return;
    if (!window.confirm(`選択した${selectionCount}項目を削除しますか？フォルダとカテゴリーの中のマニュアルも削除されます。`)) return;
    setDeleting(true);
    setBulkMessage("");
    try {
      const result = await api<{ manual_count: number; folder_count: number; category_count: number }>(
        "/manuals/bulk-delete", { method: "POST", body: JSON.stringify({
          manual_ids: selected, folder_ids: selectedFolders, category_ids: selectedCategories,
        }) });
      setBulkMessage(`${result.manual_count}件のマニュアル、${result.category_count}カテゴリー、${result.folder_count}フォルダを削除しました。`);
      setSelectedFolders([]); setSelectedCategories([]);
      setBulkMode(false);
      setSelected([]);
      reloadFolders(); reload();
    } catch (cause) { setBulkMessage((cause as Error).message); }
    finally { setDeleting(false); }
  };
  const runBulk = async (action: "organize" | "restructure" | "regenerate") => {
    if (!selected.length || bulk) return;
    setBulkMessage("");
    const names = new Map((data || []).map((item) => [item.id, item.title]));
    let tasks: { id: string; manualId: string; title: string }[];
    try {
      tasks = action === "regenerate"
        ? await api<{ id: string; manual_id: string; title: string }[]>("/manuals/incomplete-generations", {
            method: "POST", body: JSON.stringify({ manual_ids: selected }),
          }).then((items) => items.map((item) => ({ id: item.id, manualId: item.manual_id, title: item.title })))
        : selected.map((id) => ({ id, manualId: id, title: names.get(id) || id }));
    } catch (error) {
      setBulkMessage((error as Error).message);
      return;
    }
    if (!tasks.length) { setBulkMessage("選択したマニュアルに再生成できる未完成の結果はありません。"); return; }
    let succeeded = 0;
    const failures: string[] = [];
    for (const [index, task] of tasks.entries()) {
      const operationId = action === "restructure" ? "" : crypto.randomUUID();
      const actionName = action === "organize" ? "AI整理" : action === "restructure" ? "文章再解析" : "再生成";
      setBulk({ title: `一括${actionName}中`,
        detail: `${index + 1} / ${tasks.length}：${task.title}`, operationId });
      try {
        if (action === "regenerate") {
          const result = await api<{ report: { status: string } }>(
            `/generations/${task.id}/regenerate?operation_id=${operationId}`, { method: "POST" });
          if (result.report.status !== "pass") throw new Error("検品未完了");
        } else {
          await api(`/manuals/${task.id}/${action}${operationId ? `?operation_id=${operationId}` : ""}`,
            { method: "POST" });
        }
        succeeded++;
      } catch (error) {
        failures.push(`${task.title}: ${(error as Error).message}`);
      }
    }
    setBulk(null);
    reload();
    setBulkMessage(`${succeeded}件完了、${failures.length}件未完了。${failures.length ? failures.join(" / ") : ""}`);
  };
  const renderSelectionFolder = (folder: ManualFolder, seen = new Set<string>()): ReactNode => {
    if (seen.has(folder.id)) return null;
    const children = childrenByParent.get(folder.id) || [];
    const nextSeen = new Set([...seen, folder.id]);
    return <details className="manual-folder" key={folder.id}>
      <summary>
        <label className="check-label" onClick={(event) => event.stopPropagation()}>
          <input type="checkbox" checked={selectedFolders.includes(folder.id)}
            onChange={() => toggleFolder(folder.id)} aria-label={`${folder.name}フォルダを選択`} />
        </label>
        <BookOpen size={22} /><strong>{folder.name}</strong>
        <span className="muted">{children.length}フォルダ・{folder.categories.length}カテゴリー</span>
        <ArrowRight size={18} className="folder-chevron" />
      </summary>
      <div className="folder-category-list">
        {children.map((child) => renderSelectionFolder(child, nextSeen))}
        {folder.categories.map((category) => <details className="manual-category" key={category.id}>
          <summary>
            <label className="check-label" onClick={(event) => event.stopPropagation()}>
              <input type="checkbox" checked={selectedCategories.includes(category.id)}
                onChange={() => toggleCategory(folder.id, category.id)} aria-label={`${category.name}カテゴリーを選択`} />
            </label>
            <strong>{category.name}</strong>
            <span className="muted">{manualsByCategory.get(category.id)?.length || 0}件</span>
            <ArrowRight size={16} className="folder-chevron" />
          </summary>
          <div className="folder-category-list">
            {manualsByCategory.get(category.id)?.map((item) =>
              <label className="check-label" key={item.id}><input type="checkbox" checked={selected.includes(item.id)}
                onChange={() => toggleManual(item)} />{item.title}</label>)}
          </div>
        </details>)}
        {manualsByFolder.get(folder.id)?.filter((item) => !item.category_id).map((item) =>
          <label className="check-label" key={item.id}><input type="checkbox" checked={selected.includes(item.id)}
            onChange={() => toggleManual(item)} />{item.title}</label>)}
      </div>
    </details>;
  };
  return (
    <>
      {bulk && <GenerationLoading title={bulk.title} detail={bulk.detail} operationId={bulk.operationId} />}
      <PageHeading title="標準マニュアル">
        <div className="row">
          <Button className="secondary" disabled={Boolean(bulk) || deleting} onClick={() => {
            setBulkMode(!bulkMode);
            setSelected([]); setSelectedFolders([]); setSelectedCategories([]);
          }}>{bulkMode ? "一括選択を終了" : "一括選択"}</Button>
          <Link className="button secondary" to="/admin/folders">
            フォルダとカテゴリー
          </Link>
          <Link className="button" to="/admin/manuals/new">
            <Plus />
            登録する
          </Link>
        </div>
      </PageHeading>
      {error && <Alert danger>{error}</Alert>}
      {location.state?.notice && <Alert>{location.state.notice}</Alert>}
      {bulkMessage && <Alert>{bulkMessage}</Alert>}
      {bulkMode && data && <div className="row wrap bulk-actions">
        <label className="check-label"><input type="checkbox" checked={data.length > 0 && selected.length === data.length
          && selectedFolders.length === (folders || []).length
          && selectedCategories.length === (folders || []).reduce((count, folder) => count + folder.categories.length, 0)}
          onChange={(event) => {
            if (event.target.checked) {
              setSelected(data.map((item) => item.id));
              setSelectedFolders((folders || []).map((folder) => folder.id));
              setSelectedCategories((folders || []).flatMap((folder) => folder.categories.map((category) => category.id)));
            } else { setSelected([]); setSelectedFolders([]); setSelectedCategories([]); }
          }} />すべて選択（{selectionCount}項目）</label>
        <Button disabled={!selected.length || Boolean(bulk)} onClick={() => runBulk("organize")}>選択した原文をAI整理</Button>
        <Button className="secondary" disabled={!selected.length || Boolean(bulk)} onClick={() => runBulk("restructure")}>選択した文章を再解析</Button>
        <Button className="secondary" disabled={!selected.length || Boolean(bulk)} onClick={() => runBulk("regenerate")}>未完成を一括再生成</Button>
        <Button className="secondary" disabled={!selectionCount || deleting || Boolean(bulk)} onClick={runDelete}>
          選択した項目を削除</Button>
      </div>}
      {bulkMode && <Card>
        <h2>一括選択する項目</h2>
        <p className="muted">親フォルダを選ぶと下位のフォルダ・カテゴリー・マニュアルも選択します。AI整理などは選択されたマニュアルに実行します。</p>
        {childrenByParent.get("")?.map((folder) => renderSelectionFolder(folder))}
        {manualsByFolder.get("")?.map((item) => <div key={item.id}>
          <label className="check-label"><input type="checkbox" checked={selected.includes(item.id)}
            onChange={() => toggleManual(item)} />未分類: {item.title}</label>
        </div>)}
        <Button className="secondary" disabled={deleting || Boolean(bulk)} onClick={() => {
          setSelected([]); setSelectedFolders([]); setSelectedCategories([]);
        }}>選択を解除</Button>
      </Card>}
      {!bulkMode && data && (
        <ManualGroups
          items={data}
          renderCard={(m) => (
            <div className="card admin-manual" key={m.id}>
              <div className="admin-manual-status">
                <div className="row wrap">
                  <Badge tone={m.mode === "safety" ? "orange" : "blue"}>
                    {m.mode === "safety" ? "安全性重視" : "通常"}
                  </Badge>
                  {m.organization_status && ["raw", "provisional"].includes(m.organization_status) &&
                    <Badge tone="orange">AI整理途中</Badge>}
                  {!!m.pending_count && <Badge tone="orange">AI生成中</Badge>}
                  {!!m.incomplete_count && <Badge tone="orange">AI生成未完成</Badge>}
                </div>
              </div>
              <Link to={"/admin/manuals/" + m.id} className="admin-manual-link">
                <BookOpen size={30} />
                <h2>{m.title}</h2>
                <p className="muted">原文バージョン {m.current_version}</p>
                <span className="text-button">内容と個別生成 <ArrowRight size={18} /></span>
              </Link>
            </div>
          )}
        />
      )}
    </>
  );
}
function GenerationLoading({ title, detail, operationId }: { title: string; detail: string; operationId?: string }) {
  const [progress, setProgress] = useState<{ stage: string; detail: string; percent: number } | null>(null);
  useEffect(() => {
    if (!operationId) { setProgress(null); return; }
    setProgress(null);
    let active = true;
    const refresh = () => api<{ stage: string; detail: string; percent: number }>(`/operations/${operationId}`)
      .then((value) => { if (active) setProgress(value); }).catch(() => {});
    refresh();
    const timer = window.setInterval(refresh, 800);
    return () => { active = false; window.clearInterval(timer); };
  }, [operationId]);
  return <div className="generation-loading" role="status" aria-live="polite">
    <div className="generation-loading-card">
      <span className="generation-loading-spinner" aria-hidden="true" />
      <h1>{title}</h1>
      <h2>{progress?.stage || "準備中"}</h2>
      <p>{progress?.detail || detail}</p>
      {progress && detail !== progress.detail && <p className="muted">{detail}</p>}
      {progress && <Progress value={progress.percent} max={100} />}
    </div>
  </div>;
}
function NewManual() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [operationId, setOperationId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [autoClassify, setAutoClassify] = useState(false);
  const [splitIntoManuals, setSplitIntoManuals] = useState(false);
  const { data: folders } = useLoad<ManualFolder[]>("/taxonomy");
  const navigate = useNavigate();
  return (
    <>
      {busy && <GenerationLoading title={splitIntoManuals ? "マニュアルを整理しています" : "原文を取り込んでいます"}
        detail="ファイルを送信しています。この画面を開いたままお待ちください。" operationId={operationId} />}
      <PageHeading title="マニュアルを登録" />
      <Card>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const form = new FormData(e.currentTarget);
            const progressId = crypto.randomUUID();
            setOperationId(progressId);
            form.set("operation_id", progressId);
            if (!(form.get("file") as File)?.size) form.delete("file");
            try {
              const result = await api<{
                id: string;
                manuals?: { id: string; title: string; category_name: string }[];
                classification_method?: "ai" | "outline_fallback";
              }>("/manuals", {
                method: "POST",
                body: form,
              });
              if (splitIntoManuals && result.manuals) {
                navigate("/admin/manuals", { state: {
                  notice: result.classification_method === "outline_fallback"
                    ? `原文から${result.manuals.length}件のマニュアルを目次で仮仕分けしました。AIを利用できなかったため、カテゴリーと図を確認してください。`
                    : `原文から${result.manuals.length}件のマニュアルを作成しました。内容と図を確認してください。`,
                } });
                return;
              }
              let notice = "";
              if (autoClassify) {
                setOperationId("");
                try {
                  await api("/manuals/" + result.id + "/auto-classify", {
                    method: "POST",
                  });
                  notice = "AIで仕分けしました。結果を確認してください。";
                } catch (error) {
                  notice =
                    "登録は完了しました。AI仕分け: " + (error as Error).message;
                }
              }
              navigate("/admin/manuals/" + result.id, { state: { notice } });
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            マニュアルの名前
            <input
              name="title"
              required
              maxLength={160}
              placeholder="例：コピー機でA4資料をコピーする"
            />
          </label>
          <label>
            利用モード
            <select name="mode">
              <option value="speed">通常：一般作業</option>
              <option value="safety">
                安全性重視：警告と最新版の確認を必須にする
              </option>
            </select>
          </label>
          <label>
            フォルダ
            <select
              name="folder_id"
              value={folderId}
              onChange={(event) => setFolderId(event.target.value)}
            >
              <option value="">未分類</option>
              {folderOptions(folders).map(({ folder, label }) => (
                <option key={folder.id} value={folder.id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            カテゴリー
            <select
              name="category_id"
              disabled={!folderId || splitIntoManuals}
              defaultValue=""
              key={folderId}
            >
              <option value="">カテゴリー未設定</option>
              {folders
                ?.find((folder) => folder.id === folderId)
                ?.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              name="split_into_manuals"
              value="true"
              checked={splitIntoManuals}
              onChange={(event) => {
                setSplitIntoManuals(event.target.checked);
                if (event.target.checked) setAutoClassify(false);
              }}
            />
            取説を内容別のマニュアルに自動分割する
          </label>
          {splitIntoManuals && <p className="muted">
            先に文章と図を抽出し、フォルダ → カテゴリー → 個別マニュアルに分けます。
            フォルダを選ばない場合は取説の内容から作成します。作成後に内容を確認してください。
          </p>}
          <label className="check-label">
            <input
              type="checkbox"
              checked={autoClassify}
              disabled={splitIntoManuals}
              onChange={(event) => setAutoClassify(event.target.checked)}
            />
            登録後にAIで自動仕分けする
          </label>
          <p className="muted">
            AI自動仕分けは管理画面の生成モデル設定を使用します。
          </p>
          <Link className="text-button" to="/admin/folders">
            フォルダとカテゴリーを管理
          </Link>
          <label className="upload-zone">
            <Upload size={32} />
            <strong>ファイルを選ぶ</strong>
            <span>PDF / PNG / JPEG / TXT / Markdown / DOCX ・ 20MBまで</span>
            <input
              name="file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.txt,.md,.docx"
              onChange={(event) => {
                const filename = event.target.files?.[0]?.name.toLowerCase() || "";
                if (/\.(pdf|docx|txt|md)$/.test(filename)) {
                  setSplitIntoManuals(true);
                  setAutoClassify(false);
                }
              }}
            />
          </label>
          <label>
            または原文を入力
            <textarea
              name="text"
              rows={8}
              placeholder={
                "1. 電源を確認してください。\n2. 原稿をセットしてください。"
              }
            />
          </label>
          <p className="muted">
            画像と文章を同時に登録した場合、入力した文章を原文として使います。
          </p>
          {error && <Alert danger>{error}</Alert>}
          <Button disabled={busy}>
            {busy ? "取り込み中…" : "登録して内容を確認"}
            <ArrowRight size={18} />
          </Button>
        </form>
      </Card>
    </>
  );
}
function AdminManualDetail() {
  const { id } = useParams();
  const {
    data: manual,
    error,
    reload,
  } = useLoad<
    ManualRecord & {
      document: ManualDocument;
    }
  >("/manuals/" + id);
  const { data: folders, reload: reloadFolders } =
    useLoad<ManualFolder[]>("/taxonomy");
  const { data: users } = useLoad<User[]>("/users");
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [generationOperationId, setGenerationOperationId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [classifyBusy, setClassifyBusy] = useState(false);
  const [classificationMessage, setClassificationMessage] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [reparseBusy, setReparseBusy] = useState(false);
  const [reclassifyBusy, setReclassifyBusy] = useState(false);
  const [reparseMessage, setReparseMessage] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    setFolderId(manual?.folder_id || "");
    setCategoryId(manual?.category_id || "");
  }, [manual?.folder_id, manual?.category_id]);
  return (
    <>
      {busy && <GenerationLoading title="マニュアルを生成・検品しています"
        detail="処理を開始しています。完了すると検品・承認画面へ進みます。"
        operationId={generationOperationId} />}
      <PageHeading title={manual?.title || "原文を確認"} />
      {error && <Alert danger>{error}</Alert>}
      {location.state?.notice && <Alert>{location.state.notice}</Alert>}
      {manual && (
        <div className="settings-grid">
          <Card>
            <div className="row wrap">
              <Badge tone={manual.mode === "safety" ? "orange" : "blue"}>
                {manual.mode === "safety" ? "安全性重視" : "通常"}
              </Badge>
              {manual.document.organization_status !== "ai" && manual.document.raw_pages?.length &&
                <Badge tone="orange">AI整理途中</Badge>}
              {!!manual.pending_count && <Badge tone="orange">AI生成中</Badge>}
              {!!manual.incomplete_count && <Badge tone="orange">AI生成未完成</Badge>}
              <Badge>原文バージョン {manual.current_version}</Badge>
            </div>
            <h2>整理前の原文</h2>
            <p className="muted">取り込み時の文章を、分類や書き換えをせずに保存しています。</p>
            {manual.document.raw_pages?.length ? manual.document.raw_pages.map((page) => (
              <div key={page.page}>
                <Badge tone="neutral">ページ {page.page}</Badge>
                <blockquote style={{ whiteSpace: "pre-wrap" }}>{page.text || "（文字を抽出できませんでした）"}</blockquote>
              </div>
            )) : <Alert>このマニュアルには整理前の全文データがありません。従来の取り込みデータです。</Alert>}
            {!!manual.document.visual_groups?.length && <>
              <h3>画像から読み取ったまとまり</h3>
              {manual.document.visual_groups.map((group, index) => (
                <div key={`${group.page}-${index}`}>
                  <Badge tone="neutral">ページ {group.page}・{group.kind === "frame" ? "枠内" : "文章"}</Badge>
                  <blockquote style={{ whiteSpace: "pre-wrap" }}>{group.text}</blockquote>
                </div>
              ))}
            </>}
            <h2>AI整理後のデータ</h2>
            <p className="muted">{manual.document.organization_status === "ai"
              ? "原文全体を内容ごとのまとまりに整理しました。ここでは手順を細かく分けていません。分類やタグは変更できます。"
              : manual.document.organization_status === "raw"
                ? "AI整理前です。原文は保存されています。"
                : "AI整理が完了していません。原文をページ単位で暫定表示しています。"}</p>
            {manual.document.raw_pages?.length && manual.document.organization_status !== "ai" && (
              <Button disabled={reclassifyBusy} onClick={async () => {
                setReclassifyBusy(true); setReparseMessage("");
                try {
                  await api(`/manuals/${manual.id}/organize`, { method: "POST" });
                  reload();
                  setReparseMessage("AIによる整理が完了しました。");
                } catch (error) { setReparseMessage((error as Error).message); }
                finally { setReclassifyBusy(false); }
              }}>{reclassifyBusy ? "AI整理中…" : "AI整理を再試行"}</Button>
            )}
            <div className="row wrap">
            <Button disabled={reparseBusy} onClick={async () => {
              setReparseBusy(true); setReparseMessage("");
              try {
                await api(`/manuals/${manual.id}/restructure`, { method: "POST" });
                reload();
                setReparseMessage("原文をつなぎ直して分類しました。内容を確認してください。");
              } catch (error) { setReparseMessage((error as Error).message); }
              finally { setReparseBusy(false); }
            }}>{reparseBusy ? "再解析中…" : "文章をつなぎ直して再分類"}</Button>
            <Button className="secondary" disabled={reclassifyBusy} onClick={async () => {
              setReclassifyBusy(true); setReparseMessage("");
              try {
                await api(`/manuals/${manual.id}/reclassify`, { method: "POST" });
                reload();
                setReparseMessage("条件付きの説明を含めて分類を見直しました。");
              } catch (error) { setReparseMessage((error as Error).message); }
              finally { setReclassifyBusy(false); }
            }}>{reclassifyBusy ? "分類中…" : "条件付き説明を再分類"}</Button>
            </div>
            {reparseMessage && <Alert>{reparseMessage}</Alert>}
            {manual.document.extraction_notes.map((n) => (
              <Alert key={n}>{n}</Alert>
            ))}
            {manual.document.blocks.map((b, i) => <SourceBlockEditor key={b.id}
              manualId={manual.id} block={b} nextBlock={manual.document.blocks[i + 1]} onSaved={reload}
              />)}
            {!!manual.document.excluded_lines?.length && <>
              <h3>マニュアルから除外した文章</h3>
              <p className="muted">原文には残っています。必要なら原文を確認してAI整理をやり直せます。</p>
              {manual.document.excluded_lines.map((line) => (
                <blockquote key={`${line.page}-${line.line}`} style={{ whiteSpace: "pre-wrap" }}>
                  ページ {line.page}・行 {line.line}: {line.text}
                </blockquote>
              ))}
            </>}
            {manual.document.images.map((i) => (
              <ManualImageEditor key={i.id} manualId={manual.id} image={i} onSaved={reload} />
            ))}
          </Card>
          <div>
            <Card>
              <h2>フォルダとカテゴリー</h2>
              <p className="muted">フォルダ → カテゴリーの順に整理します。</p>
              <label>
                フォルダ
                <select
                  value={folderId}
                  onChange={(event) => {
                    setFolderId(event.target.value);
                    setCategoryId("");
                  }}
                >
                  <option value="">未分類</option>
                  {folderOptions(folders).map(({ folder, label }) => (
                    <option key={folder.id} value={folder.id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                カテゴリー
                <select
                  value={categoryId}
                  disabled={!folderId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">カテゴリー未設定</option>
                  {folders
                    ?.find((folder) => folder.id === folderId)
                    ?.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="row">
                <Button
                  className="secondary"
                  disabled={classifyBusy}
                  onClick={async () => {
                    setClassifyBusy(true);
                    try {
                      await api("/manuals/" + id + "/classification", {
                        method: "PUT",
                        body: JSON.stringify({
                          folder_id: folderId || null,
                          category_id: categoryId || null,
                        }),
                      });
                      reload();
                      setClassificationMessage("仕分けを保存しました。");
                    } catch (error) {
                      setClassificationMessage((error as Error).message);
                    } finally {
                      setClassifyBusy(false);
                    }
                  }}
                >
                  仕分けを保存
                </Button>
                <Button
                  className="secondary"
                  disabled={classifyBusy}
                  onClick={async () => {
                    setClassifyBusy(true);
                    try {
                      const result = await api<{
                        folder_name: string;
                        category_name: string;
                      }>("/manuals/" + id + "/auto-classify", {
                        method: "POST",
                      });
                      reload();
                      reloadFolders();
                      setClassificationMessage(
                        `AI仕分け: ${result.folder_name} → ${result.category_name}`,
                      );
                    } catch (error) {
                      setClassificationMessage((error as Error).message);
                    } finally {
                      setClassifyBusy(false);
                    }
                  }}
                >
                  AIで自動仕分け
                </Button>
              </div>
              {classificationMessage && <Alert>{classificationMessage}</Alert>}
              <Link className="text-button" to="/admin/folders">
                フォルダとカテゴリーを管理
              </Link>
            </Card>
            <Card>
              <Sparkles className="accent" size={32} />
              <h2>利用者に合わせて生成</h2>
              <p className="muted">
                表示の好みを使って変換し、原文との整合性を検品します。
              </p>
              <label>
                届ける利用者
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">選んでください</option>
                  {users
                    ?.filter((u) => u.role === "user")
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </label>
              <Button
                disabled={!target || busy}
                onClick={async () => {
                  setBusy(true);
                  setMessage("");
                  const progressId = crypto.randomUUID();
                  setGenerationOperationId(progressId);
                  try {
                    await api("/generations", {
                      method: "POST",
                      body: JSON.stringify({ manual_id: id, user_id: target, operation_id: progressId }),
                    });
                    navigate("/admin/reviews");
                  } catch (e) {
                    setMessage((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "生成・検品中…" : "個別変換と検品を開始"}
                <Sparkles size={18} />
              </Button>
              {message && <Alert danger>{message}</Alert>}
            </Card>
            <p className="muted">
              生成しただけでは公開されません。検品・承認画面で確認してください。
            </p>
            <ManualRevision manual={manual} />
            <Card>
              <h2>マニュアルを削除</h2>
              <p className="muted">このマニュアルの原文、すべての版、生成結果を削除します。</p>
              <Button className="danger-button" disabled={deleteBusy} onClick={async () => {
                if (!window.confirm(`「${manual.title}」と関連する生成結果を削除しますか？`)) return;
                setDeleteBusy(true);
                try {
                  await api(`/manuals/${manual.id}`, { method: "DELETE" });
                  navigate("/admin/manuals", { state: { notice: "マニュアルを削除しました。" } });
                } catch (cause) { setMessage((cause as Error).message); }
                finally { setDeleteBusy(false); }
              }}>削除する</Button>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
function ManualRevision({
  manual,
}: {
  manual: {
    id: string;
    title: string;
    mode: string;
    document: ManualDocument;
  };
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <details>
        <summary className="text-button">原文を更新する</summary>
        <p className="muted">
          新しいバージョンを保存します。以前の生成結果は旧版として残ります。
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const data = new FormData(e.currentTarget);
            data.set("manual_id", manual.id);
            data.set("title", manual.title);
            if (!(data.get("file") as File)?.size) data.delete("file");
            try {
              await api("/manuals", { method: "POST", body: data });
              location.reload();
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            更新後の原文
            <textarea
              name="text"
              rows={7}
              defaultValue={manual.document.blocks
                .map((b, i) => `${i + 1}. ${b.source_text}`)
                .join("\n")}
            />
          </label>
          <label>
            新しいファイル（任意）
            <input
              name="file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.txt,.md,.docx"
            />
          </label>
          <p className="muted">
            ファイルから抽出する場合は、原文欄を空にしてください。
          </p>
          <label>
            利用モード
            <select name="mode" defaultValue={manual.mode}>
              <option value="speed">通常</option>
              <option value="safety">安全性重視</option>
            </select>
          </label>
          <Button disabled={busy}>新しい版を保存</Button>
          {message && <Alert danger>{message}</Alert>}
        </form>
      </details>
    </Card>
  );
}
const CHECK_NAMES: Record<string, string> = {
  numbers: "数値一致",
  units: "単位保持",
  terms: "固有語・型番保持",
  negation: "否定表現保持",
  warnings: "警告保持",
  missing_step: "手順の網羅",
  step_order: "手順順序",
  mapping: "原文マッピング",
  images: "画像保持",
  semantics: "NLP比較",
  independent_validation: "独立検品",
};
function Reviews() {
  const { data, error, reload } = useLoad<Generation[]>("/generations");
  const [selected, setSelected] = useState<Generation | null>(null);
  const [announcement, setAnnouncement] = useState<Generation | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [regenerationOperationId, setRegenerationOperationId] = useState("");
  return (
    <>
      {regenerating && <GenerationLoading title="マニュアルを再生成しています"
        detail="原文を使って処理を開始しています。この画面を開いたままお待ちください。"
        operationId={regenerationOperationId} />}
      <PageHeading title="検品・承認" />
      <p className="muted">
        検査項目と原文を確認してから、承認・公開してください。
      </p>
      {(error || message) && <Alert>{error || message}</Alert>}
      <div className="review-list">
        {data?.map((g) => (
          <Card key={g.id}>
            <div className="row spread wrap">
              <div>
                <Badge
                  tone={
                    g.status === "PUBLISHED"
                      ? "green"
                      : g.report.status === "pass"
                        ? "blue"
                        : "orange"
                  }
                >
                  {g.status === "PUBLISHED"
                    ? "公開済み"
                    : g.status === "APPROVED"
                      ? "承認済み"
                      : g.status === "DRAFT" || g.status === "VALIDATING"
                        ? "生成中"
                        : g.report.status !== "pass"
                          ? "未完成"
                      : "確認待ち"}
                </Badge>
                <h2>{g.title}</h2>
                <p className="muted">
                  {g.user_name} ・ 原文 v{g.version} {g.stale ? "・旧版" : ""}
                </p>
              </div>
              <div className="row wrap">
                <Button
                  className="secondary"
                  onClick={() =>
                    api<Generation>("/generations/" + g.id)
                      .then(setSelected)
                      .catch((e) => setMessage(e.message))
                  }
                >
                  原文と比較
                </Button>
                {g.report.status !== "pass" &&
                  g.status !== "DRAFT" && g.status !== "VALIDATING" &&
                  g.status !== "APPROVED" && g.status !== "PUBLISHED" && (
                    <Button disabled={busy} onClick={async () => {
                      setBusy(true);
                      setRegenerating(g.id);
                      const progressId = crypto.randomUUID();
                      setRegenerationOperationId(progressId);
                      setMessage("");
                      try {
                        const result = await api<{ report: { status: string } }>(
                          "/generations/" + g.id + "/regenerate?operation_id=" + progressId,
                          { method: "POST" },
                        );
                        setMessage(result.report.status === "pass"
                          ? "再生成が完了しました。内容を確認してください。"
                          : "再生成しましたが、まだ未完成です。問題点を確認して再生成してください。");
                      } catch (e) {
                        setMessage((e as Error).message);
                      } finally {
                        setRegenerating(null);
                        setBusy(false);
                        reload();
                      }
                    }}>再生成する</Button>
                  )}
                {g.status !== "PUBLISHED" && (
                  <Button
                    disabled={busy || g.report.status !== "pass" || g.stale}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api(
                          "/generations/" +
                            g.id +
                            "/" +
                            (g.status === "APPROVED" ? "publish" : "approve"),
                          { method: "POST" },
                        );
                        setMessage(
                          g.status === "APPROVED"
                            ? "公開しました。対象利用者に通知が届きます。"
                            : "承認しました。公開すると利用者に届きます。",
                        );
                        reload();
                      } catch (e) {
                        setMessage((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {g.status === "APPROVED" ? "公開する" : "承認する"}
                    <Check size={18} />
                  </Button>
                )}
                {g.status === "PUBLISHED" && (
                  <Button
                    className="secondary"
                    onClick={() => setAnnouncement(g)}
                  >
                    <Bell size={18} />
                    重要なお知らせ
                  </Button>
                )}
                <Button className="danger-button" disabled={busy || g.status === "DRAFT" || g.status === "VALIDATING"}
                  onClick={async () => {
                    if (!window.confirm(`「${g.title}」の生成結果を削除しますか？`)) return;
                    setBusy(true);
                    try {
                      await api(`/generations/${g.id}`, { method: "DELETE" });
                      if (selected?.id === g.id) setSelected(null);
                      setMessage("生成結果を削除しました。");
                      reload();
                    } catch (cause) { setMessage((cause as Error).message); }
                    finally { setBusy(false); }
                  }}>削除する</Button>
              </div>
            </div>
            {g.report.status !== "pass" &&
              g.status !== "DRAFT" && g.status !== "VALIDATING" && (
                <Alert danger>このマニュアルは未完成です。公開する前に問題点を確認し、再生成してください。</Alert>
              )}
            {g.status === "INCOMPLETE" && !!g.saved_source_count && (
              <Alert>原文{g.saved_source_count} / {g.source_count || "?"}項目まで保存済みです。再生成すると続きから再開します。</Alert>
            )}
            <div className="checks">
              {Object.entries(g.report.checks).map(([key, ok]) => (
                <span key={key} className={ok ? "check-pass" : "check-fail"}>
                  {ok ? "✓" : "⚠"} {CHECK_NAMES[key] || key}
                </span>
              ))}
            </div>
            {g.report.issues.map((issue, i) => (
              <Alert danger key={i}>
                {issue.severity}: {issue.message}
              </Alert>
            ))}
          </Card>
        ))}
      </div>
      {announcement && (
        <BottomSheet
          title="重要なお知らせを送る"
          onClose={() => setAnnouncement(null)}
        >
          <p>
            {announcement.user_name}さんへ「{announcement.title}」を案内します。
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const title = String(new FormData(e.currentTarget).get("title"));
              try {
                await api("/announcements", {
                  method: "POST",
                  body: JSON.stringify({
                    user_id: announcement.user_id,
                    generation_id: announcement.id,
                    title,
                  }),
                });
                setAnnouncement(null);
                setMessage("重要なお知らせを送信しました。");
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            <label>
              お知らせの内容
              <input
                name="title"
                required
                maxLength={160}
                defaultValue="作業前に改訂内容を確認してください"
              />
            </label>
            <Button>この内容で通知する</Button>
          </form>
        </BottomSheet>
      )}
      {selected && (
        <BottomSheet
          title="原文と個別マニュアルの比較"
          onClose={() => setSelected(null)}
        >
          <p className="muted">
            {selected.user_name} /{" "}
            {selected.report.llm_status.startsWith("mock")
              ? "Mock検品（原文同等性）"
              : selected.report.llm_status}
          </p>
          {selected.blocks.map((b) => (
            <div className="comparison" key={b.id}>
              <div>
                <Badge tone="neutral">原文</Badge>
                {selected.document.blocks
                  .filter((s) => b.source_block_ids.includes(s.id))
                  .map((s) => (
                    <p key={s.id}>{s.source_text}</p>
                  ))}
              </div>
              <div>
                <Badge>個別表示</Badge>
                <p>{b.generated_text}</p>
                <small>{b.reason}</small>
              </div>
            </div>
          ))}
        </BottomSheet>
      )}
    </>
  );
}
function AdminUsers() {
  const { data, reload } = useLoad<User[]>("/users");
  const [message, setMessage] = useState("");
  return (
    <>
      <PageHeading title="利用者" />
      <div className="settings-grid">
        <Card>
          <h2>利用者を登録</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const values = Object.fromEntries(new FormData(form));
              try {
                await api("/users", {
                  method: "POST",
                  body: JSON.stringify(values),
                });
                setMessage(
                  "利用者を登録しました。ログイン後、表示の好みをチェックできます。",
                );
                form.reset();
                reload();
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            <label>
              表示名
              <input name="name" required />
            </label>
            <label>
              ユーザー名
              <input
                name="username"
                required
                minLength={3}
                pattern="[a-zA-Z0-9_-]+"
              />
            </label>
            <label>
              パスワード
              <input name="password" type="password" required minLength={8} />
            </label>
            <Button>
              利用者を登録
              <Plus size={18} />
            </Button>
          </form>
          {message && <Alert>{message}</Alert>}
        </Card>
        <Card>
          <h2>登録されている利用者</h2>
          {data?.map((u) => (
            <div className="user-row" key={u.id}>
              <span className="avatar">{u.name[0]}</span>
              <div>
                <strong>{u.name}</strong>
                <p>
                  <Link to={`/admin/users/${u.id}/assessment`}>
                    表示チェックの記録
                  </Link>
                </p>
                <p className="muted">
                  {u.username} ・{" "}
                  {u.role === "admin"
                    ? "管理者"
                    : `文字 ${u.profile.font_scale}倍`}
                </p>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
type BackupApi = {
  id: string;
  purpose: "generation" | "validation";
  name: string;
  provider: "gemini" | "openai_compatible";
  base_url: string;
  model: string;
};
type ApiLimit = { credential_id: string; name: string; limited_at: string };
function BackupApis() {
  const { data, reload, error } = useLoad<{ backups: BackupApi[]; limits: ApiLimit[] }>(
    "/settings/backup-apis",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [purpose, setPurpose] = useState<"generation" | "validation">("generation");
  const [provider, setProvider] = useState<"gemini" | "openai_compatible">("gemini");
  const [name, setName] = useState("");
  const [model, setModel] = useState("gemini-3.8-flash");
  const [baseUrl, setBaseUrl] = useState("https://generativelanguage.googleapis.com/v1beta/openai");
  const [apiKey, setApiKey] = useState("");
  return <Card>
    <h2>予備のAPI</h2>
    <p className="muted">メインAPIが利用制限になったとき、用途ごとに登録順で切り替えます。生成と検品はそれぞれ登録してください。キーはこの画面に再表示されません。</p>
    {error && <Alert danger>{error}</Alert>}
    {data?.backups.map((item) => {
      const limit = data.limits.find((event) => event.credential_id === item.id);
      return <div className="user-row" key={item.id}>
        <div>
          <strong>{item.name}</strong>
          <p className="muted">{item.purpose === "generation" ? "生成" : "検品"}・{item.provider === "gemini" ? "Gemini" : "OpenAI互換"}・{item.model}</p>
          {limit && <Alert danger>利用制限: {new Date(limit.limited_at).toLocaleString("ja-JP")}</Alert>}
        </div>
        <Button className="secondary" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            await api("/settings/backup-apis/" + item.id, { method: "DELETE" });
            reload();
            setMessage("予備APIを削除しました。");
          } catch (e) { setMessage((e as Error).message); }
          finally { setBusy(false); }
        }}>削除</Button>
      </div>;
    })}
    {data?.limits.filter((event) => event.credential_id.startsWith("primary:")).map((event) =>
      <Alert danger key={event.credential_id}>メインAPIの利用制限: {event.name}・{new Date(event.limited_at).toLocaleString("ja-JP")}</Alert>
    )}
    <form onSubmit={async (event) => {
      event.preventDefault();
      setBusy(true);
      setMessage("");
      try {
        await api("/settings/backup-apis", { method: "POST", body: JSON.stringify({
          purpose, name, provider, model, base_url: baseUrl, api_key: apiKey,
        }) });
        setApiKey("");
        setName("");
        reload();
        setMessage("予備APIを登録しました。");
      } catch (e) { setMessage((e as Error).message); }
      finally { setBusy(false); }
    }}>
      <div className="choice-grid">
        <label>用途<select value={purpose} onChange={(e) => setPurpose(e.target.value as "generation" | "validation")}>
          <option value="generation">生成</option><option value="validation">検品</option>
        </select></label>
        <label>名前<input value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} placeholder="予備Gemini" /></label>
        <label>Provider<select value={provider} onChange={(e) => {
          const next = e.target.value as "gemini" | "openai_compatible";
          setProvider(next);
          if (next === "gemini") { setModel("gemini-3.8-flash"); setBaseUrl("https://generativelanguage.googleapis.com/v1beta/openai"); }
        }}><option value="gemini">Google Gemini</option><option value="openai_compatible">OpenAI互換</option></select></label>
        <label>Model<input value={model} maxLength={120} required onChange={(e) => setModel(e.target.value)} /></label>
        {provider === "openai_compatible" && <label>API Base URL<input type="url" value={baseUrl} required onChange={(e) => setBaseUrl(e.target.value)} /></label>}
        <label>APIキー<input type="password" value={apiKey} required autoComplete="new-password" onChange={(e) => setApiKey(e.target.value)} /></label>
      </div>
      <Button disabled={busy}>予備APIを追加</Button>
    </form>
    {message && <Alert>{message}</Alert>}
  </Card>;
}
function AdminSettings() {
  const { data, error, reload } = useLoad<Record<string, string>>("/settings");
  const { data: logs } = useLoad<any[]>("/audit");
  const [message, setMessage] = useState("");
  const [purpose, setPurpose] = useState<"generation" | "validation">("generation");
  const [provider, setProvider] = useState<"gemini" | "openai_compatible">("gemini");
  const [model, setModel] = useState("gemini-3.8-flash");
  const [baseUrl, setBaseUrl] = useState("https://generativelanguage.googleapis.com/v1beta/openai");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <>
      <PageHeading title="AI設定・監査" />
      {error && <Alert danger>{error}</Alert>}
      <Alert>
        メインAPIを用途ごとに追加できます。キーは暗号化して保存し、この画面には再表示しません。
      </Alert>
      {data && (
        <Card>
          <h2>メインのAPI</h2>
          {["generation", "validation"].map((p) => <div className="user-row" key={p}>
            <div>
              <strong>{p === "generation" ? "生成Agent A" : "検品Agent B"}</strong>
              <p className="muted">{data[p + "_provider"] === "mock" ? "Mock（API不要）"
                : `${data[p + "_provider"] === "gemini" ? "Google Gemini" : "OpenAI互換"}・${data[p + "_model"]}`}</p>
              <p className="muted">{data[p + "_key_status"] === "saved" ? "キー登録済み"
                : data[p + "_key_status"] === "environment" ? "環境設定のキーを使用中"
                : data[p + "_key_status"] === "not_required" ? "APIキー不要"
                : "APIキー未登録"}</p>
            </div>
            <Button className="secondary" onClick={() => {
              setPurpose(p as "generation" | "validation");
              const selected = data[p + "_provider"];
              if (selected !== "mock") setProvider(selected as "gemini" | "openai_compatible");
              setModel(data[p + "_model"]);
              setBaseUrl(data[p + "_base_url"]);
              setApiKey("");
            }}>変更</Button>
          </div>)}
          <form onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setMessage("");
            try {
              await api("/settings", { method: "PUT", body: JSON.stringify({
                ...data,
                [purpose + "_provider"]: provider,
                [purpose + "_model"]: model,
                [purpose + "_base_url"]: baseUrl,
                [purpose + "_api_key"]: apiKey,
              }) });
              setApiKey("");
              reload();
              setMessage("メインAPIを登録しました。");
            } catch (e) { setMessage((e as Error).message); }
            finally { setSaving(false); }
          }}>
            <div className="choice-grid">
              <label>用途<select value={purpose} onChange={(e) => setPurpose(e.target.value as "generation" | "validation")}>
                <option value="generation">生成</option><option value="validation">検品</option>
              </select></label>
              <label>Provider<select value={provider} onChange={(e) => {
                const next = e.target.value as "gemini" | "openai_compatible";
                setProvider(next);
                if (next === "gemini") { setModel("gemini-3.8-flash"); setBaseUrl("https://generativelanguage.googleapis.com/v1beta/openai"); }
              }}><option value="gemini">Google Gemini</option><option value="openai_compatible">OpenAI互換</option></select></label>
              <label>Model<input value={model} maxLength={120} required onChange={(e) => setModel(e.target.value)} /></label>
              {provider === "openai_compatible" && <label>API Base URL<input type="url" value={baseUrl} required onChange={(e) => setBaseUrl(e.target.value)} /></label>}
              <label>APIキー<input type="password" value={apiKey} maxLength={4096} required
                autoComplete="new-password" onChange={(e) => setApiKey(e.target.value)} /></label>
            </div>
            <Button disabled={saving}>メインAPIを追加・変更</Button>
          </form>
          {message && <Alert>{message}</Alert>}
        </Card>
      )}
      <BackupApis />
      <h2>最近の監査履歴</h2>
      <Card>
        {logs?.slice(0, 20).map((log) => (
          <div className="audit-row" key={log.id}>
            <code>{log.action}</code>
            <span>{new Date(log.created_at).toLocaleString("ja-JP")}</span>
            <small>対象: {log.target_id}</small>
          </div>
        ))}
      </Card>
    </>
  );
}
if (!session()) {
  const pending = manualPathFromUrl(location.href);
  if (pending) sessionStorage.setItem("manu-return-to", pending);
}
if ("serviceWorker" in navigator)
  void navigator.serviceWorker.register("/sw.js").catch(() => {});
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

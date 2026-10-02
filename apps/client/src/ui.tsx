import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { AlertTriangle, BookOpen, CheckCircle2, Info, X } from "lucide-react";
export function Button({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={"button " + className} {...props}>
      {children}
    </button>
  );
}
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={"card " + className}>{children}</section>;
}
export function Badge({
  children,
  tone = "blue",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
export function Alert({
  children,
  danger = false,
}: {
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <div role="status" className={"alert " + (danger ? "danger" : "")}>
      {danger ? <AlertTriangle size={22} /> : <Info size={22} />}
      <span>{children}</span>
    </div>
  );
}
export function Progress({ value, max }: { value: number; max: number }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label="進捗"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <span style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  );
}
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <BookOpen size={40} />
      <p>{children}</p>
    </div>
  );
}
export function Skeleton() {
  return <div className="skeleton" role="status" aria-label="読み込み中" />;
}
export function Toast({ children }: { children: ReactNode }) {
  return (
    <div className="toast" role="status">
      <CheckCircle2 size={22} />
      {children}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  sheet = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  sheet?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} className={sheet ? "sheet" : "modal"} onCancel={onClose}>
      <div className="dialog-title">
        <h2>{title}</h2>
        <Button
          className="icon secondary"
          onClick={onClose}
          aria-label="閉じる"
        >
          <X />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
export function BottomSheet(props: Omit<Parameters<typeof Modal>[0], "sheet">) {
  return <Modal {...props} sheet />;
}
export function StepCard({ children }: { children: ReactNode }) {
  return <Card className="step-card">{children}</Card>;
}
export function ManualCard({
  title,
  count,
  safety,
  onClick,
  progress = 0,
}: {
  title: string;
  count: number;
  safety: boolean;
  onClick: () => void;
  progress?: number;
}) {
  return (
    <button className="manual-card" onClick={onClick}>
      <span className={"manual-icon " + (safety ? "warm" : "")}>
        <BookOpen size={28} />
      </span>
      <span className="manual-copy">
        <span className="manual-meta">
          {safety ? "安全性重視" : "あなた向けの手順"} ・ {count}ステップ
        </span>
        <strong>{title}</strong>
        {progress > 0 ? (
          <>
            <span>
              {progress} / {count} 完了
            </span>
            <Progress value={progress} max={count} />
          </>
        ) : (
          <span className="muted">
            約{Math.max(2, Math.ceil(count / 2))}分で確認
          </span>
        )}
      </span>
      <span aria-hidden="true">→</span>
    </button>
  );
}
export function Header({ children }: { children: ReactNode }) {
  return <header className="topbar">{children}</header>;
}
export function BottomNavigation({ children }: { children: ReactNode }) {
  return (
    <nav className="bottom-nav" aria-label="メインナビゲーション">
      {children}
    </nav>
  );
}

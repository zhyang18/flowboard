"use client";

import { CircleHelp, TriangleAlert, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type DialogTone = "default" | "danger";

type ConfirmDialogOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
};

type PromptDialogOptions = ConfirmDialogOptions & {
  inputLabel: string;
  placeholder?: string;
  defaultValue?: string;
};

type DialogRequest =
  | ({ kind: "confirm" } & ConfirmDialogOptions)
  | ({ kind: "prompt" } & PromptDialogOptions);

type DialogResult = boolean | string | null;

type DashboardDialogContextValue = {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  prompt: (options: PromptDialogOptions) => Promise<string | null>;
};

type DashboardDialogProviderProps = {
  children: ReactNode;
};

const DashboardDialogContext = createContext<DashboardDialogContextValue | null>(null);

/**
 * 返回弹框内当前可聚焦的控件，用于实现键盘焦点循环。
 *
 * @param container 弹框根元素。
 * @return 可见且未禁用的控件列表。
 */
function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
}

/**
 * 为仪表盘提供统一的确认和输入悬浮弹框。
 *
 * @param children 仪表盘页面内容。
 * @return 包含共享弹框上下文的仪表盘内容。
 */
export default function DashboardDialogProvider({
  children,
}: DashboardDialogProviderProps) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [inputValue, setInputValue] = useState("");
  const resolverRef = useRef<((result: DialogResult) => void) | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLFormElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /**
   * 关闭当前悬浮弹框并把结果返回给调用方。
   *
   * @param result 用户确认、取消或输入的结果。
   * @return 无返回值。
   */
  const finishDialog = useCallback((result: DialogResult) => {
    const resolve = resolverRef.current;
    const trigger = triggerRef.current;
    resolverRef.current = null;
    setRequest(null);
    setInputValue("");
    trigger?.focus();
    resolve?.(result);
  }, []);

  /**
   * 打开通用确认悬浮弹框。
   *
   * @param options 标题、说明、按钮文字和视觉语气。
   * @return 用户是否确认的 Promise。
   */
  const confirm = useCallback((options: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current?.(null);
      triggerRef.current = document.activeElement as HTMLElement | null;
      resolverRef.current = (result) => resolve(result === true);
      setInputValue("");
      setRequest({ kind: "confirm", ...options });
    });
  }, []);

  /**
   * 打开带文本输入框的悬浮弹框。
   *
   * @param options 标题、说明、输入提示和按钮配置。
   * @return 用户输入内容或取消结果的 Promise。
   */
  const prompt = useCallback((options: PromptDialogOptions) => {
    return new Promise<string | null>((resolve) => {
      resolverRef.current?.(null);
      triggerRef.current = document.activeElement as HTMLElement | null;
      resolverRef.current = (result) =>
        resolve(typeof result === "string" ? result : null);
      setInputValue(options.defaultValue ?? "");
      setRequest({ kind: "prompt", ...options });
    });
  }, []);

  /**
   * 提交当前确认结果或文本输入值。
   *
   * @return 无返回值。
   */
  function submitDialog() {
    finishDialog(request?.kind === "prompt" ? inputValue : true);
  }

  useEffect(() => {
    if (!request) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      if (request.kind === "prompt") inputRef.current?.focus();
      else cancelButtonRef.current?.focus();
    });

    /**
     * 支持 Escape 取消和 Tab 焦点循环。
     *
     * @param event 浏览器键盘事件。
     * @return 无返回值。
     */
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        finishDialog(null);
        return;
      }
      if (event.key !== "Tab") return;

      const elements = getFocusableElements(dialogRef.current);
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [finishDialog, request]);

  const contextValue = useMemo(
    () => ({ confirm, prompt }),
    [confirm, prompt],
  );

  return (
    <DashboardDialogContext.Provider value={contextValue}>
      {children}
      {request && (
        <div
          className="dashboard-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) finishDialog(null);
          }}
        >
          <form
            className={`dashboard-dialog ${request.tone === "danger" ? "danger" : ""}`}
            ref={dialogRef}
            role={request.tone === "danger" ? "alertdialog" : "dialog"}
            aria-modal="true"
            aria-labelledby="dashboard-dialog-title"
            aria-describedby="dashboard-dialog-description"
            onSubmit={(event) => {
              event.preventDefault();
              submitDialog();
            }}
          >
            <header>
              <span className="dashboard-dialog-icon" aria-hidden="true">
                {request.tone === "danger" ? (
                  <TriangleAlert size={21} />
                ) : (
                  <CircleHelp size={21} />
                )}
              </span>
              <div>
                <span className="eyebrow">
                  {request.tone === "danger" ? "请谨慎确认" : "操作确认"}
                </span>
                <h2 id="dashboard-dialog-title">{request.title}</h2>
              </div>
              <button
                className="dashboard-dialog-close"
                type="button"
                aria-label="关闭弹框"
                onClick={() => finishDialog(null)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="dashboard-dialog-content">
              <p id="dashboard-dialog-description">{request.message}</p>
              {request.kind === "prompt" && (
                <label>
                  <span>{request.inputLabel}</span>
                  <input
                    ref={inputRef}
                    value={inputValue}
                    placeholder={request.placeholder}
                    autoComplete="off"
                    onChange={(event) => setInputValue(event.target.value)}
                  />
                </label>
              )}
            </div>
            <footer>
              <button
                ref={cancelButtonRef}
                type="button"
                onClick={() => finishDialog(null)}
              >
                {request.cancelLabel ?? "取消"}
              </button>
              <button
                className={request.tone === "danger" ? "dialog-danger-action" : "primary-action"}
                type="submit"
              >
                {request.confirmLabel ?? "确认"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </DashboardDialogContext.Provider>
  );
}

/**
 * 获取仪表盘统一悬浮弹框控制器。
 *
 * @return 确认和输入弹框方法。
 */
export function useDashboardDialog(): DashboardDialogContextValue {
  const context = useContext(DashboardDialogContext);
  if (!context) {
    throw new Error("useDashboardDialog 必须在 DashboardDialogProvider 内使用。");
  }
  return context;
}

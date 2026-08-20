"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type Locale,
  translations,
} from "./translations";

/**
 * 语言上下文值类型定义。
 */
export type LanguageContextValue = {
  /** 当前生效的语言 */
  locale: Locale;
  /** 设置并持久化当前语言 */
  setLocale: (locale: Locale) => void;
  /** 翻译文案提取方法，支持点路径与占位符参数 */
  t: (path: string, params?: Record<string, string | number>) => string;
  /** 获取用户系统全局角色的本地化标签 */
  getRoleLabel: (role: string) => string;
  /** 获取项目内成员角色的本地化标签 */
  getProjectRoleLabel: (role: string) => string;
  /** 获取用户账号状态的本地化标签 */
  getUserStatusLabel: (status: string) => string;
  /** 获取项目生命周期状态的本地化标签 */
  getProjectStatusLabel: (status: string) => string;
  /** 获取任务执行状态的本地化标签 */
  getTaskStatusLabel: (status: string) => string;
  /** 获取任务优先级的本地化标签 */
  getTaskPriorityLabel: (priority: string) => string;
  /** 获取迭代状态的本地化标签 */
  getSprintStatusLabel: (status: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "flowboard_locale";

/**
 * 从嵌套翻译对象中安全解析路径字符串对应的值。
 *
 * @param obj 词典对象。
 * @param path 路径点号表达式（如 "settings.saveButton"）。
 * @return 找到的文案模板或未找到时返回原始路径。
 */
function resolvePath(obj: Record<string, unknown>, path: string): string {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return path;
    }
  }
  return typeof current === "string" ? current : path;
}

/**
 * 将文案模板中的占位符如 `{count}` 替换为对应参数。
 *
 * @param template 原始文案模板。
 * @param params 替换参数映射表。
 * @return 完成参数插值后的文本。
 */
function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return key in params ? String(params[key]) : match;
  });
}

/**
 * 获取客户端保存的默认语言偏好。
 *
 * @return 本地存储、Cookie 中的语言偏好或默认 "zh"。
 */
function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "zh";

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    // 忽略 localStorage 访问异常
  }

  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${STORAGE_KEY}=([^;]*)`));
    if (match && (match[1] === "zh" || match[1] === "en")) {
      return match[1] as Locale;
    }
  } catch {
    // 忽略 cookie 访问异常
  }

  return "zh";
}

/**
 * 语言上下文提供者组件，负责全站语言状态广播与客户端持久化。
 *
 * @param children 子组件节点。
 * @return 包含语言上下文的 Provider 节点。
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  /**
   * 切换界面语言并持久化到本地存储与 Cookie。
   *
   * @param nextLocale 待切换的目标语言。
   */
  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    try {
      localStorage.setItem(STORAGE_KEY, nextLocale);
    } catch {
      // 忽略 localStorage 写入错误
    }
    try {
      document.cookie = `${STORAGE_KEY}=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // 忽略 cookie 写入错误
    }
    document.documentElement.lang = nextLocale === "zh" ? "zh-CN" : "en";
  }, []);

  /**
   * 文案翻译方法，支持格式化插值。
   *
   * @param path 点路径字符串。
   * @param params 占位符参数映射。
   * @return 本地化文案。
   */
  const t = useCallback(
    (path: string, params?: Record<string, string | number>): string => {
      const activeTranslations = translations[locale] as unknown as Record<string, unknown>;
      const fallbackTranslations = translations.zh as unknown as Record<string, unknown>;
      const template =
        resolvePath(activeTranslations, path) !== path
          ? resolvePath(activeTranslations, path)
          : resolvePath(fallbackTranslations, path);
      return interpolate(template, params);
    },
    [locale],
  );

  /**
   * 获取用户系统全局角色的本地化显示名称。
   *
   * @param role 用户全局角色代码。
   * @return 对应的本地化标签。
   */
  const getRoleLabel = useCallback(
    (role: string): string => {
      const dict = translations[locale].roles as Record<string, string>;
      return dict[role] ?? role;
    },
    [locale],
  );

  /**
   * 获取项目内成员角色的本地化显示名称。
   *
   * @param role 项目成员角色代码。
   * @return 对应的本地化标签。
   */
  const getProjectRoleLabel = useCallback(
    (role: string): string => {
      const dict = translations[locale].projectRoles as Record<string, string>;
      return dict[role] ?? role;
    },
    [locale],
  );

  /**
   * 获取用户账号状态的本地化显示名称。
   *
   * @param status 用户状态代码。
   * @return 对应的本地化标签。
   */
  const getUserStatusLabel = useCallback(
    (status: string): string => {
      const dict = translations[locale].userStatuses as Record<string, string>;
      return dict[status] ?? status;
    },
    [locale],
  );

  /**
   * 获取项目状态的本地化显示名称。
   *
   * @param status 项目状态代码。
   * @return 对应的本地化标签。
   */
  const getProjectStatusLabel = useCallback(
    (status: string): string => {
      const dict = translations[locale].projectStatuses as Record<string, string>;
      return dict[status] ?? status;
    },
    [locale],
  );

  /**
   * 获取任务看板状态的本地化显示名称。
   *
   * @param status 任务状态代码。
   * @return 对应的本地化标签。
   */
  const getTaskStatusLabel = useCallback(
    (status: string): string => {
      const dict = translations[locale].taskStatuses as Record<string, string>;
      return dict[status] ?? status;
    },
    [locale],
  );

  /**
   * 获取任务优先级的本地化显示名称。
   *
   * @param priority 任务优先级代码。
   * @return 对应的本地化标签。
   */
  const getTaskPriorityLabel = useCallback(
    (priority: string): string => {
      const dict = translations[locale].taskPriorities as Record<string, string>;
      return dict[priority] ?? priority;
    },
    [locale],
  );

  /**
   * 获取迭代生命周期状态的本地化显示名称。
   *
   * @param status 迭代状态代码。
   * @return 对应的本地化标签。
   */
  const getSprintStatusLabel = useCallback(
    (status: string): string => {
      const dict = translations[locale].sprintStatuses as Record<string, string>;
      return dict[status] ?? status;
    },
    [locale],
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      getRoleLabel,
      getProjectRoleLabel,
      getUserStatusLabel,
      getProjectStatusLabel,
      getTaskStatusLabel,
      getTaskPriorityLabel,
      getSprintStatusLabel,
    }),
    [
      locale,
      setLocale,
      t,
      getRoleLabel,
      getProjectRoleLabel,
      getUserStatusLabel,
      getProjectStatusLabel,
      getTaskStatusLabel,
      getTaskPriorityLabel,
      getSprintStatusLabel,
    ],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * 获取当前语言上下文与其操作方法。
 *
 * @return 语言上下文值。
 */
export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage 必须在 LanguageProvider 内使用。");
  }
  return context;
}

/**
 * 便捷获取当前翻译方法 t 与当前语言。
 *
 * @return 包含 t 方法和当前语言的环境对象。
 */
export function useTranslation() {
  const {
    t,
    locale,
    setLocale,
    getRoleLabel,
    getProjectRoleLabel,
    getUserStatusLabel,
    getProjectStatusLabel,
    getTaskStatusLabel,
    getTaskPriorityLabel,
    getSprintStatusLabel,
  } = useLanguage();
  return {
    t,
    locale,
    setLocale,
    getRoleLabel,
    getProjectRoleLabel,
    getUserStatusLabel,
    getProjectStatusLabel,
    getTaskStatusLabel,
    getTaskPriorityLabel,
    getSprintStatusLabel,
  };
}

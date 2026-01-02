import type { AppSettings, Locale, ThemeMode } from '../electron/shared'

export type I18nKey =
  | 'new'
  | 'open'
  | 'save'
  | 'menu'
  | 'quit'
  | 'settings'
  | 'settings.title'
  | 'settings.theme'
  | 'settings.theme.system'
  | 'settings.theme.dark'
  | 'settings.theme.light'
  | 'settings.language'
  | 'settings.language.zhCN'
  | 'settings.language.zhTW'
  | 'settings.language.en'
  | 'settings.language.ja'
  | 'settings.language.ko'
  | 'settings.dockDelay'
  | 'settings.hiddenWidth'
  | 'settings.shownWidth'
  | 'cancel'
  | 'apply'

const dict: Record<Locale, Record<I18nKey, string>> = {
  'zh-CN': {
    new: '新建',
    open: '打开',
    save: '保存',
    menu: '菜单',
    quit: '退出',
    settings: '设置',
    'settings.title': '设置',
    'settings.theme': '界面模式',
    'settings.theme.system': '跟随系统',
    'settings.theme.dark': '深色模式',
    'settings.theme.light': '浅色模式',
    'settings.language': '语言',
    'settings.language.zhCN': '简体中文',
    'settings.language.zhTW': '繁體中文',
    'settings.language.en': '英语',
    'settings.language.ja': '日语',
    'settings.language.ko': '韩语',
    'settings.dockDelay': '靠边回收延迟（ms）',
    'settings.hiddenWidth': '靠边收缩宽度（px）',
    'settings.shownWidth': '靠边展开宽度（px）',
    cancel: '取消',
    apply: '应用'
  },
  'zh-TW': {
    new: '新增',
    open: '打開',
    save: '儲存',
    menu: '選單',
    quit: '退出',
    settings: '設定',
    'settings.title': '設定',
    'settings.theme': '介面模式',
    'settings.theme.system': '跟隨系統',
    'settings.theme.dark': '深色模式',
    'settings.theme.light': '淺色模式',
    'settings.language': '語言',
    'settings.language.zhCN': '簡體中文',
    'settings.language.zhTW': '繁體中文',
    'settings.language.en': '英語',
    'settings.language.ja': '日語',
    'settings.language.ko': '韓語',
    'settings.dockDelay': '靠邊回收延遲（ms）',
    'settings.hiddenWidth': '靠邊收縮寬度（px）',
    'settings.shownWidth': '靠邊展開寬度（px）',
    cancel: '取消',
    apply: '套用'
  },
  en: {
    new: 'New',
    open: 'Open',
    save: 'Save',
    menu: 'Menu',
    quit: 'Quit',
    settings: 'Settings',
    'settings.title': 'Settings',
    'settings.theme': 'Theme',
    'settings.theme.system': 'System',
    'settings.theme.dark': 'Dark',
    'settings.theme.light': 'Light',
    'settings.language': 'Language',
    'settings.language.zhCN': 'Simplified Chinese',
    'settings.language.zhTW': 'Traditional Chinese',
    'settings.language.en': 'English',
    'settings.language.ja': 'Japanese',
    'settings.language.ko': 'Korean',
    'settings.dockDelay': 'Auto-hide delay (ms)',
    'settings.hiddenWidth': 'Collapsed width (px)',
    'settings.shownWidth': 'Expanded width (px)',
    cancel: 'Cancel',
    apply: 'Apply'
  },
  ja: {
    new: '新規',
    open: '開く',
    save: '保存',
    menu: 'メニュー',
    quit: '終了',
    settings: '設定',
    'settings.title': '設定',
    'settings.theme': 'テーマ',
    'settings.theme.system': 'システム',
    'settings.theme.dark': 'ダーク',
    'settings.theme.light': 'ライト',
    'settings.language': '言語',
    'settings.language.zhCN': '簡体中国語',
    'settings.language.zhTW': '繁体中国語',
    'settings.language.en': '英語',
    'settings.language.ja': '日本語',
    'settings.language.ko': '韓国語',
    'settings.dockDelay': '自動収納の遅延（ms）',
    'settings.hiddenWidth': '収納幅（px）',
    'settings.shownWidth': '展開幅（px）',
    cancel: 'キャンセル',
    apply: '適用'
  },
  ko: {
    new: '새로 만들기',
    open: '열기',
    save: '저장',
    menu: '메뉴',
    quit: '종료',
    settings: '설정',
    'settings.title': '설정',
    'settings.theme': '테마',
    'settings.theme.system': '시스템',
    'settings.theme.dark': '다크',
    'settings.theme.light': '라이트',
    'settings.language': '언어',
    'settings.language.zhCN': '중국어(간체)',
    'settings.language.zhTW': '중국어(번체)',
    'settings.language.en': '영어',
    'settings.language.ja': '일본어',
    'settings.language.ko': '한국어',
    'settings.dockDelay': '자동 숨김 지연(ms)',
    'settings.hiddenWidth': '접힘 너비(px)',
    'settings.shownWidth': '펼침 너비(px)',
    cancel: '취소',
    apply: '적용'
  }
}

export function t(locale: Locale, key: I18nKey): string {
  return dict[locale]?.[key] ?? dict.en[key] ?? key
}

export function themeLabel(locale: Locale, theme: ThemeMode) {
  if (theme === 'dark') return t(locale, 'settings.theme.dark')
  if (theme === 'light') return t(locale, 'settings.theme.light')
  return t(locale, 'settings.theme.system')
}

export function normalizeSettings(s: AppSettings): AppSettings {
  return s
}


import type { AppSettings, Locale, ThemeMode } from '../electron/shared'

export type I18nKey =
  | 'new'
  | 'open'
  | 'save'
  | 'export'
  | 'export.html'
  | 'export.pdf'
  | 'export.word'
  | 'version'
  | 'back'
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
  | 'noFile.title'
  | 'noFile.desc'
  | 'noFile.prompt'
  | 'noFile.action.openFile'
  | 'noFile.action.newFile'
  | 'cancel'
  | 'apply'
  | 'md.heading'
  | 'md.bold'
  | 'md.italic'
  | 'md.strike'
  | 'md.inlineCode'
  | 'md.codeBlock'
  | 'md.quote'
  | 'md.ul'
  | 'md.ol'
  | 'md.task'
  | 'md.link'
  | 'md.image'
  | 'md.table'
  | 'md.hr'
  | 'pane.toc'
  | 'pane.editor'
  | 'pane.preview'
  | 'toc.aria'
  | 'toc.empty'
  | 'panelToggle.group'
  | 'panelToggle.toc'
  | 'panelToggle.editor'
  | 'panelToggle.preview'

const dict: Record<Locale, Record<I18nKey, string>> = {
  'zh-CN': {
    new: '新建',
    open: '打开',
    save: '保存',
    export: '导出',
    'export.html': '导出为 HTML',
    'export.pdf': '导出为 PDF',
    'export.word': '导出为 Word（.doc）',
    version: '版本',
    back: '返回',
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
    'noFile.title': '当前没有打开的文件',
    'noFile.desc': '点击这里选择「新建文件」或「打开文件」',
    'noFile.prompt': '请选择接下来要做什么：',
    'noFile.action.openFile': '打开文件',
    'noFile.action.newFile': '新建文件',
    cancel: '取消',
    apply: '应用',
    'md.heading': '标题（#）',
    'md.bold': '加粗（**）',
    'md.italic': '斜体（*）',
    'md.strike': '删除线（~~）',
    'md.inlineCode': '行内代码（`）',
    'md.codeBlock': '代码块（```）',
    'md.quote': '引用（>）',
    'md.ul': '无序列表（-）',
    'md.ol': '有序列表（1.）',
    'md.task': '任务列表（- [ ]）',
    'md.link': '链接（[text](url)）',
    'md.image': '图片（![alt](url)）',
    'md.table': '表格',
    'md.hr': '分割线（---）',
    'pane.toc': '目录',
    'pane.editor': '编辑器',
    'pane.preview': '预览',
    'toc.aria': 'Markdown 目录',
    'toc.empty': '（未检测到标题）',
    'panelToggle.group': '显示/隐藏面板',
    'panelToggle.toc': 'Markdown 目录',
    'panelToggle.editor': '编辑器',
    'panelToggle.preview': '预览'
  },
  'zh-TW': {
    new: '新增',
    open: '打開',
    save: '儲存',
    export: '匯出',
    'export.html': '匯出為 HTML',
    'export.pdf': '匯出為 PDF',
    'export.word': '匯出為 Word（.doc）',
    version: '版本',
    back: '返回',
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
    'noFile.title': '目前沒有開啟的檔案',
    'noFile.desc': '點擊這裡選擇「新增檔案」或「開啟檔案」',
    'noFile.prompt': '請選擇接下來要做什麼：',
    'noFile.action.openFile': '開啟檔案',
    'noFile.action.newFile': '新增檔案',
    cancel: '取消',
    apply: '套用',
    'md.heading': '標題（#）',
    'md.bold': '粗體（**）',
    'md.italic': '斜體（*）',
    'md.strike': '刪除線（~~）',
    'md.inlineCode': '行內程式碼（`）',
    'md.codeBlock': '程式碼區塊（```）',
    'md.quote': '引用（>）',
    'md.ul': '無序清單（-）',
    'md.ol': '有序清單（1.）',
    'md.task': '任務清單（- [ ]）',
    'md.link': '連結（[text](url)）',
    'md.image': '圖片（![alt](url)）',
    'md.table': '表格',
    'md.hr': '分隔線（---）',
    'pane.toc': '目錄',
    'pane.editor': '編輯器',
    'pane.preview': '預覽',
    'toc.aria': 'Markdown 目錄',
    'toc.empty': '（未偵測到標題）',
    'panelToggle.group': '顯示/隱藏面板',
    'panelToggle.toc': 'Markdown 目錄',
    'panelToggle.editor': '編輯器',
    'panelToggle.preview': '預覽'
  },
  en: {
    new: 'New',
    open: 'Open',
    save: 'Save',
    export: 'Export',
    'export.html': 'Export as HTML',
    'export.pdf': 'Export as PDF',
    'export.word': 'Export as Word (.doc)',
    version: 'Version',
    back: 'Back',
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
    'noFile.title': 'No file is currently open',
    'noFile.desc': 'Click here to choose “New File” or “Open File”',
    'noFile.prompt': 'What would you like to do next?',
    'noFile.action.openFile': 'Open File',
    'noFile.action.newFile': 'New File',
    cancel: 'Cancel',
    apply: 'Apply',
    'md.heading': 'Heading (#)',
    'md.bold': 'Bold (**)',
    'md.italic': 'Italic (*)',
    'md.strike': 'Strikethrough (~~)',
    'md.inlineCode': 'Inline code (`)',
    'md.codeBlock': 'Code block (```)',
    'md.quote': 'Quote (>)',
    'md.ul': 'Bulleted list (-)',
    'md.ol': 'Numbered list (1.)',
    'md.task': 'Task list (- [ ])',
    'md.link': 'Link ([text](url))',
    'md.image': 'Image (![alt](url))',
    'md.table': 'Table',
    'md.hr': 'Horizontal rule (---)',
    'pane.toc': 'Outline',
    'pane.editor': 'Editor',
    'pane.preview': 'Preview',
    'toc.aria': 'Markdown outline',
    'toc.empty': '(No headings found)',
    'panelToggle.group': 'Show/hide panels',
    'panelToggle.toc': 'Markdown outline',
    'panelToggle.editor': 'Editor',
    'panelToggle.preview': 'Preview'
  },
  ja: {
    new: '新規',
    open: '開く',
    save: '保存',
    export: 'エクスポート',
    'export.html': 'HTML にエクスポート',
    'export.pdf': 'PDF にエクスポート',
    'export.word': 'Word（.doc）にエクスポート',
    version: 'バージョン',
    back: '戻る',
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
    'noFile.title': '開いているファイルはありません',
    'noFile.desc': 'クリックして「新規ファイル」または「ファイルを開く」を選択',
    'noFile.prompt': '次に行う操作を選択してください：',
    'noFile.action.openFile': 'ファイルを開く',
    'noFile.action.newFile': '新規ファイル',
    cancel: 'キャンセル',
    apply: '適用',
    'md.heading': '見出し（#）',
    'md.bold': '太字（**）',
    'md.italic': '斜体（*）',
    'md.strike': '取り消し線（~~）',
    'md.inlineCode': 'インラインコード（`）',
    'md.codeBlock': 'コードブロック（```）',
    'md.quote': '引用（>）',
    'md.ul': '箇条書き（-）',
    'md.ol': '番号付きリスト（1.）',
    'md.task': 'タスクリスト（- [ ]）',
    'md.link': 'リンク（[text](url)）',
    'md.image': '画像（![alt](url)）',
    'md.table': '表',
    'md.hr': '区切り線（---）',
    'pane.toc': '目次',
    'pane.editor': 'エディタ',
    'pane.preview': 'プレビュー',
    'toc.aria': 'Markdown 目次',
    'toc.empty': '（見出しが見つかりません）',
    'panelToggle.group': 'パネルの表示/非表示',
    'panelToggle.toc': 'Markdown 目次',
    'panelToggle.editor': 'エディタ',
    'panelToggle.preview': 'プレビュー'
  },
  ko: {
    new: '새로 만들기',
    open: '열기',
    save: '저장',
    export: '내보내기',
    'export.html': 'HTML로 내보내기',
    'export.pdf': 'PDF로 내보내기',
    'export.word': 'Word(.doc)로 내보내기',
    version: '버전',
    back: '뒤로',
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
    'noFile.title': '열려 있는 파일이 없습니다',
    'noFile.desc': '여기를 클릭하여 “새 파일” 또는 “파일 열기”를 선택하세요',
    'noFile.prompt': '다음에 무엇을 하시겠습니까?',
    'noFile.action.openFile': '파일 열기',
    'noFile.action.newFile': '새 파일',
    cancel: '취소',
    apply: '적용',
    'md.heading': '제목(#)',
    'md.bold': '굵게(**)',
    'md.italic': '기울임(*)',
    'md.strike': '취소선(~~)',
    'md.inlineCode': '인라인 코드(`)',
    'md.codeBlock': '코드 블록(```)',
    'md.quote': '인용(>)',
    'md.ul': '글머리 기호 목록(-)',
    'md.ol': '번호 매기기 목록(1.)',
    'md.task': '작업 목록(- [ ])',
    'md.link': '링크([text](url))',
    'md.image': '이미지(![alt](url))',
    'md.table': '표',
    'md.hr': '가로줄(---)',
    'pane.toc': '목차',
    'pane.editor': '편집기',
    'pane.preview': '미리보기',
    'toc.aria': 'Markdown 목차',
    'toc.empty': '(제목을 찾을 수 없음)',
    'panelToggle.group': '패널 표시/숨기기',
    'panelToggle.toc': 'Markdown 목차',
    'panelToggle.editor': '편집기',
    'panelToggle.preview': '미리보기'
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


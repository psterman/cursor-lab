#Requires AutoHotkey v2.0
; SQLite3.dll 自动加载说明：
; - 64位系统：自动加载 x64\SQLite3.dll
; - 32位系统：自动加载 x86\SQLite3.dll
; - 如果架构目录不存在，会尝试从 SQLiteDB.ini 读取或回退到根目录的 SQLite3.dll
#Include lib\Class_SQLiteDB.ahk

; 设置托盘图标
TraySetIcon(A_ScriptDir "\images\curser.ico")

; 配置托盘菜单
SetupTrayMenu()

; ======================================================
; Cursor Audit Pro - Simple Edition (无浏览器控件版本)
; ======================================================

; 测试 DebugView 输出是否工作
OutputDebug("[简单版] ========================================")
OutputDebug("[简单版] 脚本启动 - 无浏览器控件版本 (深度提取器 v2.15 - minimax2策略优化 - 文件位置: " . A_ScriptFullPath . ")")
OutputDebug("[简单版] ========================================")

; ======================================================
; 全局错误处理系统
; ======================================================

; 错误日志文件路径
global ErrorLogFile := A_ScriptDir "\debug.txt"

; 获取系统信息
GetSystemInfo() {
    info := Map()
    
    ; 操作系统信息
    try {
        info["OSVersion"] := A_OSVersion
        info["OSBuild"] := RegRead("HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion", "CurrentBuild")
    } catch {
        info["OSVersion"] := A_OSVersion
        info["OSBuild"] := "未知"
    }
    
    ; AutoHotkey 版本
    info["AHKVersion"] := A_AhkVersion
    
    ; 计算机名
    try {
        info["ComputerName"] := EnvGet("COMPUTERNAME")
    } catch {
        info["ComputerName"] := "未知"
    }
    
    ; 用户名
    try {
        info["UserName"] := EnvGet("USERNAME")
    } catch {
        info["UserName"] := "未知"
    }
    
    ; 内存信息
    try {
        mem := DllCall("GlobalMemoryStatusEx", "Ptr", memStatus := Buffer(64), "Int")
        if (mem) {
            totalMem := NumGet(memStatus, 8, "Int64")
            availMem := NumGet(memStatus, 16, "Int64")
            info["TotalMemory"] := Round(totalMem / 1024 / 1024 / 1024, 2) . " GB"
            info["AvailableMemory"] := Round(availMem / 1024 / 1024 / 1024, 2) . " GB"
        } else {
            info["TotalMemory"] := "未知"
            info["AvailableMemory"] := "未知"
        }
    } catch {
        info["TotalMemory"] := "未知"
        info["AvailableMemory"] := "未知"
    }
    
    ; 屏幕分辨率
    try {
        screenWidth := SysGet(78)  ; SM_CXSCREEN
        screenHeight := SysGet(79)  ; SM_CYSCREEN
        info["ScreenResolution"] := screenWidth . "x" . screenHeight
    } catch {
        info["ScreenResolution"] := "未知"
    }
    
    ; 脚本路径
    info["ScriptPath"] := A_ScriptFullPath
    info["ScriptDir"] := A_ScriptDir
    info["WorkingDir"] := A_WorkingDir
    
    return info
}

; 格式化错误信息
FormatErrorInfo(Error, Context := "") {
    timestamp := FormatTime(, "yyyy-MM-dd HH:mm:ss")
    sysInfo := GetSystemInfo()
    
    errorText := "`n"
    errorText .= "========================================`n"
    errorText .= "错误报告 - " . timestamp . "`n"
    errorText .= "========================================`n"
    errorText .= "`n"
    errorText .= "【错误信息】`n"
    errorText .= "  错误消息: " . (Error.Message ? Error.Message : "未知错误") . "`n"
    errorText .= "  错误代码: " . (Error.Extra ? Error.Extra : "无") . "`n"
    errorText .= "  错误文件: " . (Error.File ? Error.File : "未知") . "`n"
    errorText .= "  错误行号: " . (Error.Line ? Error.Line : "未知") . "`n"
    errorText .= "  错误堆栈: " . (Error.Stack ? Error.Stack : "无") . "`n"
    errorText .= "`n"
    
    if (Context != "") {
        errorText .= "【上下文信息】`n"
        errorText .= "  " . Context . "`n"
        errorText .= "`n"
    }
    
    errorText .= "【系统信息】`n"
    errorText .= "  操作系统: Windows " . sysInfo["OSVersion"] . " (Build " . sysInfo["OSBuild"] . ")`n"
    errorText .= "  AutoHotkey版本: " . sysInfo["AHKVersion"] . "`n"
    errorText .= "  计算机名: " . sysInfo["ComputerName"] . "`n"
    errorText .= "  用户名: " . sysInfo["UserName"] . "`n"
    errorText .= "  总内存: " . sysInfo["TotalMemory"] . "`n"
    errorText .= "  可用内存: " . sysInfo["AvailableMemory"] . "`n"
    errorText .= "  屏幕分辨率: " . sysInfo["ScreenResolution"] . "`n"
    errorText .= "  脚本路径: " . sysInfo["ScriptPath"] . "`n"
    errorText .= "  工作目录: " . sysInfo["WorkingDir"] . "`n"
    errorText .= "`n"
    errorText .= "========================================`n"
    errorText .= "`n"
    
    return errorText
}

; 记录错误到文件
LogError(Error, Context := "") {
    try {
        errorText := FormatErrorInfo(Error, Context)
        FileAppend(errorText, ErrorLogFile, "UTF-8")
        OutputDebug("[错误处理] 错误已记录到: " . ErrorLogFile)
    } catch as e {
        ; 如果写入文件失败，至少输出到 DebugView
        OutputDebug("[错误处理] ❌ 无法写入错误日志: " . e.Message)
        OutputDebug("[错误处理] 原始错误信息: " . FormatErrorInfo(Error, Context))
    }
}

; 全局错误处理器
GlobalErrorHandler(Error, Mode) {
    ; 记录错误
    LogError(Error, "全局错误处理器捕获")
    
    ; 显示用户友好的错误提示
    try {
        MsgBox("程序发生错误，错误信息已记录到 debug.txt 文件中。`n`n错误: " . Error.Message . "`n`n文件: " . (Error.File ? Error.File : "未知") . "`n行号: " . (Error.Line ? Error.Line : "未知"), "程序错误", "Iconx")
    } catch {
        ; 如果显示消息框也失败，至少输出到 DebugView
        OutputDebug("[错误处理] ❌ 无法显示错误对话框")
    }
    
    ; 返回 false 表示不阻止默认错误处理
    return false
}

; 设置全局错误处理器
OnError(GlobalErrorHandler)

; 初始化错误日志（记录启动信息）
try {
    startupInfo := "`n"
    startupInfo .= "========================================`n"
    startupInfo .= "程序启动 - " . FormatTime(, "yyyy-MM-dd HH:mm:ss") . "`n"
    startupInfo .= "========================================`n"
    sysInfo := GetSystemInfo()
    startupInfo .= "操作系统: Windows " . sysInfo["OSVersion"] . " (Build " . sysInfo["OSBuild"] . ")`n"
    startupInfo .= "AutoHotkey版本: " . sysInfo["AHKVersion"] . "`n"
    startupInfo .= "计算机名: " . sysInfo["ComputerName"] . "`n"
    startupInfo .= "用户名: " . sysInfo["UserName"] . "`n"
    startupInfo .= "脚本路径: " . sysInfo["ScriptPath"] . "`n"
    startupInfo .= "========================================`n"
    startupInfo .= "`n"
    FileAppend(startupInfo, ErrorLogFile, "UTF-8")
} catch {
    ; 忽略启动日志写入失败
}

global AllWorkspaces := []
global CurrentChatNodes := []
global FilteredChatNodes := []  ; 过滤后的聊天节点
global CurrentLang := "zh"
global IsDarkMode := false  ; 默认亮色模式，可切换
global ProjectDDL := unset
global ChatListView := unset  ; ListView 控件
global ContentEdit := unset  ; 内容显示 Edit 控件
global LastExportPath := ""  ; 上次导出路径
global CustomDBPath := ""  ; 自定义数据库路径
global SearchHistory := []  ; 搜索历史记录
global SearchFrequency := Map()  ; 搜索词频率统计

; 深度提取相关全局变量
global ExtractedTextSet := Map()  ; 去重集合，避免重复文本
global ExtractionStats := Map()  ; 提取统计信息

; 配置文件路径
global ConfigFile := A_ScriptDir "\config.ini"

; ======================================================
; 配置管理函数
; ======================================================

; 读取配置
LoadConfig() {
    global ConfigFile, CurrentLang, IsDarkMode, LastExportPath, CustomDBPath, SearchHistory, SearchFrequency
    
    try {
        ; 读取语言设置
        lang := IniRead(ConfigFile, "Settings", "Language", "zh")
        if (lang = "zh" || lang = "en") {
            CurrentLang := lang
        }
        
        ; 读取主题设置
        darkMode := IniRead(ConfigFile, "Settings", "DarkMode", "0")
        IsDarkMode := (darkMode = "1")
        
        ; 读取窗口位置和大小
        winX := IniRead(ConfigFile, "Window", "X", "")
        winY := IniRead(ConfigFile, "Window", "Y", "")
        winW := IniRead(ConfigFile, "Window", "Width", "")
        winH := IniRead(ConfigFile, "Window", "Height", "")
        monitorNum := IniRead(ConfigFile, "Window", "Monitor", "")
        
        ; 读取导出路径
        LastExportPath := IniRead(ConfigFile, "Export", "LastPath", "")
        
        ; 读取自定义数据库路径
        CustomDBPath := IniRead(ConfigFile, "Database", "CustomPath", "")
        
        ; 读取搜索历史（最近5个）
        SearchHistory := []
        loop 5 {
            historyItem := IniRead(ConfigFile, "SearchHistory", "Item" . A_Index, "")
            if (historyItem != "") {
                SearchHistory.Push(historyItem)
            }
        }
        
        ; 读取搜索频率统计（前5个）
        SearchFrequency := Map()
        loop 5 {
            freqItem := IniRead(ConfigFile, "SearchFrequency", "Item" . A_Index, "")
            freqCount := IniRead(ConfigFile, "SearchFrequency", "Count" . A_Index, "0")
            if (freqItem != "" && freqCount != "0") {
                SearchFrequency[freqItem] := Number(freqCount)
            }
        }
        
        OutputDebug("[配置] 配置已加载: 语言=" . CurrentLang . ", 主题=" . (IsDarkMode ? "暗色" : "亮色"))
        
        ; 返回窗口配置信息
        return {X: winX, Y: winY, Width: winW, Height: winH, Monitor: monitorNum}
    } catch as e {
        OutputDebug("[配置] 读取配置失败，使用默认值: " . e.Message)
        return {X: "", Y: "", Width: "", Height: "", Monitor: ""}
    }
}

; 保存配置
SaveConfig() {
    global ConfigFile, CurrentLang, IsDarkMode, LastExportPath, CustomDBPath, SearchHistory, SearchFrequency
    
    try {
        ; 保存语言设置
        IniWrite(CurrentLang, ConfigFile, "Settings", "Language")
        
        ; 保存主题设置
        IniWrite(IsDarkMode ? "1" : "0", ConfigFile, "Settings", "DarkMode")
        
        ; 保存导出路径
        if (LastExportPath != "") {
            IniWrite(LastExportPath, ConfigFile, "Export", "LastPath")
        }
        
        ; 保存自定义数据库路径
        if (CustomDBPath != "") {
            IniWrite(CustomDBPath, ConfigFile, "Database", "CustomPath")
        }
        
        ; 保存搜索历史（最近5个）
        loop 5 {
            if (A_Index <= SearchHistory.Length) {
                IniWrite(SearchHistory[A_Index], ConfigFile, "SearchHistory", "Item" . A_Index)
            } else {
                IniDelete(ConfigFile, "SearchHistory", "Item" . A_Index)
            }
        }
        
        ; 保存搜索频率统计（前5个）
        ; 先按频率排序
        sortedFreq := []
        for keyword, count in SearchFrequency {
            sortedFreq.Push({keyword: keyword, count: count})
        }
        ; 简单排序（按频率降序）
        loop sortedFreq.Length - 1 {
            i := A_Index
            loop sortedFreq.Length - i {
                j := A_Index + i
                if (sortedFreq[i].count < sortedFreq[j].count) {
                    temp := sortedFreq[i]
                    sortedFreq[i] := sortedFreq[j]
                    sortedFreq[j] := temp
                }
            }
        }
        
        ; 保存前5个
        loop 5 {
            if (A_Index <= sortedFreq.Length) {
                item := sortedFreq[A_Index]
                IniWrite(item.keyword, ConfigFile, "SearchFrequency", "Item" . A_Index)
                IniWrite(item.count, ConfigFile, "SearchFrequency", "Count" . A_Index)
            } else {
                IniDelete(ConfigFile, "SearchFrequency", "Item" . A_Index)
                IniDelete(ConfigFile, "SearchFrequency", "Count" . A_Index)
            }
        }
        
        OutputDebug("[配置] 配置已保存")
    } catch as e {
        OutputDebug("[配置] 保存配置失败: " . e.Message)
        LogError(e, "SaveConfig 函数保存配置时发生错误")
    }
}

; 保存窗口位置和大小
SaveWindowConfig(x, y, w, h, monitor := "") {
    global ConfigFile
    try {
        if (x != "" && y != "") {
            IniWrite(x, ConfigFile, "Window", "X")
            IniWrite(y, ConfigFile, "Window", "Y")
        }
        if (w != "" && h != "") {
            IniWrite(w, ConfigFile, "Window", "Width")
            IniWrite(h, ConfigFile, "Window", "Height")
        }
        if (monitor != "") {
            IniWrite(monitor, ConfigFile, "Window", "Monitor")
        }
    } catch as e {
        OutputDebug("[配置] 保存窗口配置失败: " . e.Message)
    }
}

; 添加搜索历史
AddSearchHistory(keyword) {
    global SearchHistory, SearchFrequency
    
    if (keyword = "" || StrLen(keyword) < 2) {
        return
    }
    
    ; 移除重复项（如果存在）
    try {
        idx := SearchHistory.IndexOf(keyword)
        if (idx > 0) {
            SearchHistory.RemoveAt(idx)
        }
    } catch {
        ; 不存在，继续
    }
    
    ; 添加到开头
    SearchHistory.InsertAt(1, keyword)
    
    ; 限制最多5个
    if (SearchHistory.Length > 5) {
        SearchHistory.Pop()
    }
    
    ; 更新频率统计
    if (SearchFrequency.Has(keyword)) {
        SearchFrequency[keyword] := SearchFrequency[keyword] + 1
    } else {
        SearchFrequency[keyword] := 1
    }
    
    ; 保存配置
    SaveConfig()
}

; 程序启动时加载配置
winConfig := LoadConfig()

; 语言包配置
global LangPack := Map(
    "zh", Map("find", "搜索", "ready", "就绪", "loading", "解析中...", "copy", "复制", "search", "复制搜索", "no_data", "暂无历史记录",
        "lang_btn", "English", "theme_btn_dark", "深色模式", "theme_btn_light", "亮色模式", "items", "条", "export", "导出",
        "export_all", "导出全部", "user", "用户", "ai", "AI"),
    "en", Map("find", "Search", "ready", "Ready", "loading", "Loading...", "copy", "Copy", "search", "Copy Search",
        "no_data", "No History", "lang_btn", "中文版", "theme_btn_dark", "Dark", "theme_btn_light", "Light",
        "items", "Items", "export", "Export", "export_all", "Export All", "user", "User", "ai", "AI")
)

; JSON 解析配置
global UseJScriptJSON := false  ; 是否使用 JScript JSON 解析
global JSONScriptObj := unset    ; JScript 控制对象

; 提取策略配置（方案A+B的核心）
global ExtractionMaxDepth := 6  ; 最大递归深度，防止无限循环
global ExtractionEnableRecursive := true  ; 是否启用递归解析嵌套 JSON
global ExtractionPriority := Map(  ; 字段优先级顺序（从高到低）
    "modelResponse.code", 12,       ; 代码片段（最高优先级）
    "modelResponse.codeBlock", 11,  ; 代码块
    "modelResponse.implementation", 10, ; 实现
    "modelResponse.suggestions", 9, ; 建议
    "modelResponse.changes", 8,     ; 修改
    "modelResponse.diff", 7,        ; 差异
    "modelResponse.fixes", 6,       ; 修复
    "modelResponse.modifications", 5, ; 修改
    "modelResponse.codeAnalysis", 4, ; 代码分析
    "modelResponse.text", 3,
    "modelResponse.richText", 2,
    "modelResponse.content", 1,
    "bubble.code", 13,              ; 直接代码字段
    "bubble.codeBlock", 12,
    "bubble.implementation", 11,
    "bubble.text", 10,
    "bubble.richText", 9,
    "bubble.content", 8,
    "bubble.message.text", 7,
    "recursive_search", 6
)

; 尝试初始化 JScript JSON
try {
    JSONScriptObj := ComObject("ScriptControl")
    JSONScriptObj.Language := "JScript"
    JSONScriptObj.AddCode("function parseJson(str){return JSON.parse(str);}")
    UseJScriptJSON := true
    OutputDebug("[JSON] ✓ JScript JSON 解析器初始化成功")
} catch {
    UseJScriptJSON := false
    OutputDebug("[JSON] ✗ JScript JSON 解析器不可用，将使用增强的正则表达式方案")
}

; 界面初始化
MyGui := Gui("+Resize -DPIScale", "抠搜 - curser (简单版)")
MyGui.BackColor := IsDarkMode ? "333333" : "F0F2F5"
MyGui.SetFont("s10", "Microsoft YaHei UI")

L := LangPack[CurrentLang]
topbarBgColor := IsDarkMode ? "444444" : "FFFFFF"
linkColor := IsDarkMode ? "CCCCCC" : "778087"
btnBgColor := IsDarkMode ? "555555" : topbarBgColor
borderColor := IsDarkMode ? "555555" : "E5E5E5"
txtColor := IsDarkMode ? "CCCCCC" : "333333"
iconColor := IsDarkMode ? "999999" : "777777"
statusColor := IsDarkMode ? "AAAAAA" : "8e918f"

; Topbar 背景
TopbarBg := MyGui.Add("Text", "x0 y0 w2000 h50 Background" . topbarBgColor . " vTopbarBg")
TopbarBg.Opt("+0x100 +Disabled")

; Topbar 左侧 - 节点选择
ProjectDDL := MyGui.Add("DDL", "x15 y13 w240 h200 Choose1 Background" . btnBgColor . " c" . txtColor . " vProjectList")
ProjectDDL.OnEvent("Change", OnProjectChange)
ProjectDDL.SetFont("s9", "Microsoft YaHei UI")

; Topbar 中间 - 搜索区域
SearchContainerX := 270
SearchIcon := MyGui.Add("Text", "x" . (SearchContainerX + 10) . " y12 w24 h26 c" . iconColor . " Background" . topbarBgColor . " vSearchIcon", "🔍")
SearchIcon.SetFont("s14", "Segoe UI Emoji")
SearchIcon.Opt("+0x200")

SearchEditWidth := 355
global SearchEditX := SearchContainerX + 40
SearchEdit := MyGui.Add("Edit", "x" . SearchEditX . " y12 w" . SearchEditWidth . " h26 Background" . topbarBgColor . " c" . txtColor . " vSearchKey")
SearchEdit.OnEvent("Change", OnSearchChange)
SearchEdit.SetFont("s9", "Microsoft YaHei UI")

; Topbar 右侧工具区域
BtnSettings := MyGui.Add("Text", "x910 y12 w40 h26 c" . linkColor . " Background" . btnBgColor . " +0x200 +0x100 vBtnSettings", "🔑")
BtnSettings.SetFont("s12", "Segoe UI Emoji")
BtnSettings.Opt("+Center")
BtnSettings.OnEvent("Click", ShowSettingsDialog)

Divider1 := MyGui.Add("Text", "x950 y12 w1 h26 Background" . borderColor . " vDivider1")

btnBorderStyle := IsDarkMode ? "" : "Border"
BtnLang := MyGui.Add("Text", "x960 y12 w70 h26 c" . linkColor . " Background" . btnBgColor . " +0x200 +0x100 " . btnBorderStyle . " vBtnLang", L["lang_btn"])
BtnLang.SetFont("s9 Bold", "Microsoft YaHei UI")
BtnLang.Opt("+Center")
BtnLang.OnEvent("Click", ToggleLanguage)

themeBtnText := IsDarkMode ? L["theme_btn_light"] : L["theme_btn_dark"]
BtnTheme := MyGui.Add("Text", "x1030 y12 w80 h26 c" . linkColor . " Background" . btnBgColor . " +0x200 +0x100 " . btnBorderStyle . " vBtnTheme", themeBtnText)
BtnTheme.SetFont("s9 Bold", "Microsoft YaHei UI")
BtnTheme.Opt("+Center")
BtnTheme.OnEvent("Click", ToggleTheme)

StatusTxt := MyGui.Add("Text", "x1110 y15 w120 h26 c" . statusColor . " Background" . topbarBgColor . " vStatus +0x200", L["ready"])
StatusTxt.SetFont("s9", "Microsoft YaHei UI")
StatusTxt.Opt("+Right")

; Topbar 底部边框
TopbarBorder := MyGui.Add("Text", "x0 y49 w1250 h1 Background" . borderColor . " vTopbarBorder")

; 主内容区域 - ListView 显示聊天记录列表
listViewBg := IsDarkMode ? "2D2D2D" : "FFFFFF"
listViewTxt := IsDarkMode ? "CCCCCC" : "333333"
ChatListView := MyGui.Add("ListView", "x0 y50 w600 h800 vChatList -Hdr -Multi Background" . listViewBg . " c" . listViewTxt, ["ID", "预览"])
ChatListView.OnEvent("Click", OnChatListClick)
ChatListView.OnEvent("DoubleClick", OnChatListDoubleClick)
ChatListView.SetFont("s9", "Microsoft YaHei UI")

; 操作按钮区域（放在内容区域上方，居中排列）
; 按钮总宽度：80 + 10 + 100 + 10 + 100 = 290
; 内容区域宽度：640，居中位置：(640 - 290) / 2 = 175
buttonStartX := 610 + 175
buttonY := 50
BtnCopy := MyGui.Add("Button", "x" . buttonStartX . " y" . buttonY . " w80 h30 vBtnCopy", L["copy"])
BtnCopy.OnEvent("Click", OnCopyClick)

BtnExportSingle := MyGui.Add("Button", "x" . (buttonStartX + 90) . " y" . buttonY . " w100 h30 vBtnExportSingle", L["export"])
BtnExportSingle.OnEvent("Click", OnExportSingleClick)

BtnExportAll := MyGui.Add("Button", "x" . (buttonStartX + 200) . " y" . buttonY . " w100 h30 vBtnExportAll", L["export_all"])
BtnExportAll.OnEvent("Click", OnExportAllClick)

; 内容显示区域 - Edit 控件显示详细内容（按钮下方）
contentBg := IsDarkMode ? "2D2D2D" : "FFFFFF"
contentTxt := IsDarkMode ? "CCCCCC" : "333333"
ContentEdit := MyGui.Add("Edit", "x610 y" . (buttonY + 35) . " w640 h715 vContentEdit ReadOnly Multi Background" . contentBg . " c" . contentTxt)
ContentEdit.SetFont("s9", "Consolas")

; 窗口显示配置
showOptions := ""
if (winConfig.Width != "" && winConfig.Height != "") {
    showOptions := "w" . winConfig.Width . " h" . winConfig.Height
} else {
    showOptions := "w1250 h850"
}

if (winConfig.X != "" && winConfig.Y != "") {
    showOptions .= " x" . winConfig.X . " y" . winConfig.Y
}

MyGui.Show(showOptions)

; 窗口关闭事件
MyGui.OnEvent("Close", OnGuiClose)
MyGui.OnEvent("Size", OnGuiSize)

; 窗口关闭处理
OnGuiClose(*) {
    global MyGui
    try {
        WinGetPos(&x, &y, &w, &h, MyGui)
        monitorNum := ""
        try {
            monitorNum := MonitorGetPrimary()
            loop MonitorGetCount() {
                MonitorGet(A_Index, &Left, &Top, &Right, &Bottom)
                if (x >= Left && x < Right && y >= Top && y < Bottom) {
                    monitorNum := A_Index
                    break
                }
            }
        } catch {
            monitorNum := ""
        }
        SaveWindowConfig(x, y, w, h, monitorNum)
        SaveConfig()
    } catch {
        ; 忽略错误
    }
    ExitApp()
}

; 窗口大小调整
OnGuiSize(guiObj, minMax, width, height) {
    global ChatListView, ContentEdit, MyGui, BtnCopy, BtnExportSingle, BtnExportAll
    
    if (minMax = -1) {
        return
    }
    
    if (width <= 0 || height <= 0) {
        return
    }
    
    try {
        ; 调整 ListView 大小（左侧，占窗口宽度的 50%）
        listWidth := Round(width * 0.48)
        ChatListView.Move(, , listWidth, height - 50)
        
        ; 调整按钮位置（在内容区域上方，居中排列）
        contentX := listWidth + 10
        contentWidth := width - contentX - 10
        buttonY := 50
        buttonTotalWidth := 290  ; 80 + 10 + 100 + 10 + 100 = 290（按钮宽度+间距）
        buttonStartX := contentX + Round((contentWidth - buttonTotalWidth) / 2)
        BtnCopy.Move(buttonStartX, buttonY)
        BtnExportSingle.Move(buttonStartX + 90, buttonY)
        BtnExportAll.Move(buttonStartX + 200, buttonY)
        
        ; 调整内容 Edit 控件大小（按钮下方）
        contentHeight := height - buttonY - 35 - 10
        ContentEdit.Move(contentX, buttonY + 35, contentWidth, contentHeight)
        
        ; 调整 Topbar 背景和边框
        MyGui["TopbarBg"].Move(, , width)
        MyGui["TopbarBorder"].Move(0, 49, width, 1)
        
        ; 保存窗口大小
        WinGetPos(&x, &y, , , MyGui)
        SaveWindowConfig(x, y, width, height)
    } catch as e {
        OutputDebug("[窗口调整] 调整失败: " . e.Message)
    }
}

; ListView 点击事件
OnChatListClick(lv, *) {
    global CurrentChatNodes, ContentEdit, FilteredChatNodes
    
    selectedRow := lv.GetNext()
    if (selectedRow = 0) {
        return
    }
    
    ; 获取选中行的索引（第一列是原始索引）
    originalIdx := lv.GetText(selectedRow, 1)
    idx := Number(originalIdx)
    
    ; 从 CurrentChatNodes 中获取完整内容
    if (idx >= 1 && idx <= CurrentChatNodes.Length) {
        node := CurrentChatNodes[idx]
        ; 直接显示文本内容，不显示角色说明
        ContentEdit.Value := node.Text
    }
}

; ListView 双击事件（复制内容）
OnChatListDoubleClick(lv, *) {
    OnCopyClick()
}

; 复制按钮点击
OnCopyClick(*) {
    global ContentEdit, MyGui
    
    content := ContentEdit.Value
    if (content = "") {
        ToolTip("没有可复制的内容")
        SetTimer(() => ToolTip(), -2000)
        return
    }
    
    ; 直接复制文本内容（已去掉角色说明）
    A_Clipboard := content
    try {
        WinGetPos(&winX, &winY, , , MyGui)
        ToolTip("✅ 已复制", winX + 20, winY + 70)
    } catch {
        ToolTip("✅ 已复制", 20, 20)
    }
    SetTimer(() => ToolTip(), -2000)
}

; 导出单条按钮点击
OnExportSingleClick(*) {
    global ChatListView, CurrentChatNodes
    
    selectedRow := ChatListView.GetNext()
    if (selectedRow = 0) {
        ToolTip("请先选择一条记录")
        SetTimer(() => ToolTip(), -2000)
        return
    }
    
    originalIdx := ChatListView.GetText(selectedRow, 1)
    idx := Number(originalIdx)
    
    ; 显示格式选择对话框
    format := ShowFormatDialog()
    if (format = "") {
        return
    }
    
    ExportSingleData(idx, format)
}

; 导出全部按钮点击
OnExportAllClick(*) {
    format := ShowFormatDialog()
    if (format = "") {
        return
    }
    
    ExportData(format)
}

; 显示格式选择对话框
ShowFormatDialog() {
    formatGui := Gui("+Owner" . MyGui.Hwnd . " +ToolWindow", "选择导出格式")
    formatGui.BackColor := IsDarkMode ? "444444" : "FFFFFF"
    formatGui.SetFont("s9", "Microsoft YaHei UI")
    
    selectedFormat := ""
    
    formatGui.Add("Text", "x20 y20 w200 h30 c" . txtColor . " Background" . (IsDarkMode ? "444444" : "FFFFFF"), "请选择导出格式：")
    
    btnMD := formatGui.Add("Button", "x20 y60 w80 h30 Default", "MD")
    btnMD.OnEvent("Click", (*) => (selectedFormat := "md", formatGui.Destroy()))
    
    btnJSON := formatGui.Add("Button", "x110 y60 w80 h30", "JSON")
    btnJSON.OnEvent("Click", (*) => (selectedFormat := "json", formatGui.Destroy()))
    
    btnTXT := formatGui.Add("Button", "x200 y60 w80 h30", "TXT")
    btnTXT.OnEvent("Click", (*) => (selectedFormat := "txt", formatGui.Destroy()))
    
    btnCSV := formatGui.Add("Button", "x290 y60 w80 h30", "CSV")
    btnCSV.OnEvent("Click", (*) => (selectedFormat := "csv", formatGui.Destroy()))
    
    btnCancel := formatGui.Add("Button", "x200 y100 w80 h30", "取消")
    btnCancel.OnEvent("Click", (*) => formatGui.Destroy())
    
    formatGui.Show("w400 h150")
    WinWaitClose(formatGui)
    
    return selectedFormat
}

; 搜索框变化事件
OnSearchChange(ed, *) {
    global CurrentChatNodes, FilteredChatNodes, ChatListView, StatusTxt, LangPack, CurrentLang
    
    keyword := ed.Value
    FilteredChatNodes := []
    
    L := LangPack[CurrentLang]
    
    if (keyword = "") {
        ; 显示所有记录，统一数据结构
        for idx, node in CurrentChatNodes {
            FilteredChatNodes.Push({OriginalIdx: idx, Node: node})
        }
    } else {
        ; 过滤记录
        for idx, node in CurrentChatNodes {
            if (InStr(node.Text, keyword)) {
                FilteredChatNodes.Push({OriginalIdx: idx, Node: node})
            }
        }
    }
    
    ; 更新 ListView
    ChatListView.Delete()
    for item in FilteredChatNodes {
        idx := item.OriginalIdx
        node := item.Node
        
        ; 生成预览文本（前50个字符）
        preview := SubStr(node.Text, 1, 50)
        if (StrLen(node.Text) > 50) {
            preview .= "..."
        }
        preview := StrReplace(StrReplace(preview, "`n", " "), "`r", " ")
        
        ChatListView.Add("", idx, preview)
    }
    
    ; 更新状态
    StatusTxt.Text := FilteredChatNodes.Length . " " . L["items"]
    
    ; 如果有搜索结果，添加到搜索历史
    if (keyword != "" && StrLen(keyword) >= 2) {
        AddSearchHistory(keyword)
    }
}

; 显示设置对话框
ShowSettingsDialog(*) {
    global CustomDBPath, MyGui, IsDarkMode, CurrentLang, LangPack
    
    L := LangPack[CurrentLang]
    txtColor := IsDarkMode ? "CCCCCC" : "333333"
    bgColor := IsDarkMode ? "444444" : "FFFFFF"
    btnBg := IsDarkMode ? "555555" : "F5F5F5"
    
    SettingsGui := Gui("+Owner" . MyGui.Hwnd . " +ToolWindow", "数据库路径设置")
    SettingsGui.BackColor := bgColor
    SettingsGui.SetFont("s9", "Microsoft YaHei UI")
    
    SettingsGui.Add("Text", "x20 y20 w400 h40 c" . txtColor . " Background" . bgColor, "指定数据库扫描路径（支持目录或单个.vscdb文件）`n留空则使用默认路径: %AppData%\Cursor\User\workspaceStorage")
    
    SettingsGui.Add("Text", "x20 y70 w80 h26 c" . txtColor . " Background" . bgColor . " +0x200", "数据库路径:")
    PathEdit := SettingsGui.Add("Edit", "x100 y70 w350 h26 Background" . btnBg . " c" . txtColor . " vDBPath", CustomDBPath)
    
    BrowseBtn := SettingsGui.Add("Button", "x460 y70 w60 h26", "浏览...")
    BrowseBtn.OnEvent("Click", (*) => BrowseDBPath(PathEdit))
    
    TestBtn := SettingsGui.Add("Button", "x530 y70 w60 h26", "测试")
    TestBtn.OnEvent("Click", (*) => TestDBPath(PathEdit, StatusLabel))
    
    StatusLabel := SettingsGui.Add("Text", "x20 y110 w570 h30 c" . txtColor . " Background" . bgColor . " vStatusLabel", "")
    
    OkBtn := SettingsGui.Add("Button", "x400 y150 w80 h30 Default", "确定")
    OkBtn.OnEvent("Click", (*) => SaveDBPath(SettingsGui, PathEdit, StatusLabel))
    
    CancelBtn := SettingsGui.Add("Button", "x490 y150 w80 h30", "取消")
    CancelBtn.OnEvent("Click", (*) => SettingsGui.Destroy())
    
    SettingsGui.Show("w600 h200")
}

; 浏览数据库路径
BrowseDBPath(editCtrl) {
    path := DirSelect("*" . A_ScriptDir, 0, "选择数据库目录或文件")
    if (path != "") {
        editCtrl.Value := path
    }
}

; 测试数据库路径
TestDBPath(editCtrl, statusLabel) {
    path := editCtrl.Value
    
    if (path = "") {
        StatusLabel.Text := "✓ 将使用默认路径"
        return
    }
    
    if (!FileExist(path) && !DirExist(path)) {
        StatusLabel.Text := "❌ 路径不存在"
        return
    }
    
    found := false
    if (FileExist(path) && SubStr(path, -7) = ".vscdb") {
        found := true
    } else if (DirExist(path)) {
        loop files, path "\*.vscdb", "F" {
            found := true
            break
        }
        if (!found) {
            loop files, path "\*\state.vscdb", "F" {
                found := true
                break
            }
        }
    }
    
    if (found) {
        StatusLabel.Text := "✓ 路径有效，找到数据库文件"
    } else {
        StatusLabel.Text := "⚠️ 路径存在但未找到数据库文件，将尝试扫描"
    }
}

; 保存数据库路径
SaveDBPath(gui, editCtrl, statusLabel) {
    global CustomDBPath
    
    path := Trim(editCtrl.Value)
    
    if (path != "" && !FileExist(path) && !DirExist(path)) {
        statusLabel.Text := "❌ 路径不存在，请检查后重试"
        return
    }
    
    CustomDBPath := path
    SaveConfig()
    
    global AllWorkspaces
    AllWorkspaces := []
    ScanWorkspaces()
    UpdateDDL()
    
    if (AllWorkspaces.Length > 0) {
        global ProjectDDL
        ProjectDDL.Choose(1)
        OnProjectChange(ProjectDDL)
    }
    
    statusLabel.Text := "✓ 已保存，工作区已刷新"
    Sleep(1000)
    gui.Destroy()
}

ToggleLanguage(*) {
    global CurrentLang, BtnLang, BtnTheme, StatusTxt, LangPack, MyGui, IsDarkMode
    
    CurrentLang := (CurrentLang = "zh") ? "en" : "zh"
    L := LangPack[CurrentLang]
    
    MyGui["BtnLang"].Text := L["lang_btn"]
    themeBtnText := IsDarkMode ? L["theme_btn_light"] : L["theme_btn_dark"]
    MyGui["BtnTheme"].Text := themeBtnText
    MyGui["Status"].Text := L["ready"]
    
    ; 更新按钮文本
    MyGui["BtnCopy"].Text := L["copy"]
    MyGui["BtnExportSingle"].Text := L["export"]
    MyGui["BtnExportAll"].Text := L["export_all"]
    
    ; 刷新视图
    RefreshView(MyGui["SearchKey"].Value)
    SaveConfig()
}

ToggleTheme(*) {
    global IsDarkMode, MyGui, ProjectDDL, BtnLang, BtnTheme, LangPack, CurrentLang, ChatListView, ContentEdit
    
    IsDarkMode := !IsDarkMode
    
    L := LangPack[CurrentLang]
    txtColor := IsDarkMode ? "CCCCCC" : "333333"
    topbarBg := IsDarkMode ? "444444" : "FFFFFF"
    btnBg := IsDarkMode ? "555555" : "FFFFFF"
    borderColor := IsDarkMode ? "555555" : "E5E5E5"
    linkColor := IsDarkMode ? "CCCCCC" : "778087"
    iconColor := IsDarkMode ? "999999" : "777777"
    statusColor := IsDarkMode ? "AAAAAA" : "8e918f"
    listViewBg := IsDarkMode ? "2D2D2D" : "FFFFFF"
    listViewTxt := IsDarkMode ? "CCCCCC" : "333333"
    contentBg := IsDarkMode ? "2D2D2D" : "FFFFFF"
    contentTxt := IsDarkMode ? "CCCCCC" : "333333"
    
    MyGui.BackColor := IsDarkMode ? "333333" : "F0F2F5"
    
    MyGui["TopbarBg"].Opt("Background" . topbarBg)
    MyGui["TopbarBorder"].Opt("Background" . borderColor)
    
    ; 更新项目下拉菜单
    try {
        oldValue := ProjectDDL.Value
        oldItems := []
        loop ProjectDDL.Length {
            oldItems.Push(ProjectDDL.Text)
        }
        ProjectDDL.Destroy()
        ddlBg := IsDarkMode ? "333333" : btnBg
        ddlTxt := IsDarkMode ? "FFFFFF" : txtColor
        global ProjectDDL := MyGui.Add("DDL", "x15 y13 w240 h200 Choose" . oldValue . " Background" . ddlBg . " c" . ddlTxt . " vProjectList")
        ProjectDDL.Add(oldItems)
        ProjectDDL.OnEvent("Change", OnProjectChange)
        ProjectDDL.SetFont("s9", "Microsoft YaHei UI")
    } catch {
        ; 忽略错误
    }
    
    MyGui["SearchIcon"].Opt("Background" . topbarBg . " c" . iconColor)
    MyGui["SearchKey"].Opt("Background" . topbarBg . " c" . txtColor)
    
    MyGui["Divider1"].Opt("Background" . borderColor)
    btnBgColor := IsDarkMode ? "555555" : topbarBg
    btnBorderStyle := IsDarkMode ? "-Border" : "+Border"
    MyGui["BtnLang"].Opt("Background" . btnBgColor . " c" . linkColor . " " . btnBorderStyle)
    MyGui["BtnTheme"].Opt("Background" . btnBgColor . " c" . linkColor . " " . btnBorderStyle)
    MyGui["BtnSettings"].Opt("Background" . btnBgColor . " c" . linkColor)
    
    themeBtnText := IsDarkMode ? L["theme_btn_light"] : L["theme_btn_dark"]
    MyGui["BtnTheme"].Text := themeBtnText
    MyGui["Status"].Opt("Background" . topbarBg . " c" . statusColor)
    
    ; 更新聊天列表和内容区域的暗色模式样式
    try {
        ChatListView.Opt("Background" . listViewBg . " c" . listViewTxt)
        ContentEdit.Opt("Background" . contentBg . " c" . contentTxt)
    } catch {
        ; 忽略错误
    }
    
    SaveConfig()
}

OnProjectChange(ddl, *) {
    global CurrentChatNodes, AllWorkspaces, UseJScriptJSON, ChatListView, StatusTxt, LangPack, CurrentLang
    global ExtractedTextSet, ExtractionStats

    try {
        if (ddl.Value = "") {
            return
        }

        ; 重置全局变量
        CurrentChatNodes := []
        ExtractedTextSet := Map()
        ExtractionStats := Map()
        L := LangPack[CurrentLang]
        StatusTxt.Text := L["loading"]
        
        path := AllWorkspaces[ddl.Value].Path
        tempDB := A_Temp "\cursor_simple.db"
        try {
            FileCopy(path, tempDB, true)
        } catch as e {
            LogError(e, "OnProjectChange 函数复制数据库文件时发生错误")
            throw
        }
        
        db := SQLiteDB()
        if (db.OpenDB(tempDB)) {
            totalBubbles := 0
            shortText := 0
            noText := 0
            parseErrors := 0
            jsonExtracted := 0  ; JSON解析提取的数据量

            OutputDebug("[简单版] 数据库已打开，开始解析数据...")
            OutputDebug("[简单版] UseJScriptJSON: " . (UseJScriptJSON ? "true" : "false"))

            ; 检查数据库表结构
            if (db.GetTable("SELECT name FROM sqlite_master WHERE type='table'", &tables)) {
                OutputDebug("[简单版] 数据库包含 " . tables.RowCount . " 个表:")
                loop tables.RowCount {
                    tableName := tables.Rows[A_Index][1]
                    OutputDebug("[简单版]   表: " . tableName)
                    ; 检查每个表的记录数
                    if (db.GetTable("SELECT COUNT(*) as cnt FROM [" . tableName . "]", &countResult)) {
                        recordCount := countResult.Rows[1][1]
                        OutputDebug("[简单版]     记录数: " . recordCount)
                    }
                }
            }

            ; 分析itemTable中的key分布
            if (db.GetTable("SELECT DISTINCT [key], COUNT(*) as cnt FROM itemTable GROUP BY [key] ORDER BY cnt DESC LIMIT 10", &keyStats)) {
                OutputDebug("[简单版] itemTable中前10个最常见的key:")
                loop keyStats.RowCount {
                    keyName := keyStats.Rows[A_Index][1]
                    keyCount := keyStats.Rows[A_Index][2]
                    OutputDebug("[简单版]   " . keyName . " (" . keyCount . " 条记录)")
                }
            }
            
            ; 优先使用 JSON 解析
            if (UseJScriptJSON) {
                sql := "SELECT value FROM itemTable WHERE [key] = 'workbench.panel.aichat.view.aichat.chatdata'"
                OutputDebug("[简单版] 执行 JSON 查询: " . sql)
                if (db.GetTable(sql, &table)) {
                    OutputDebug("[简单版] JSON 查询返回 " . table.RowCount . " 行")
                    loop table.RowCount {
                        row := table.Rows[A_Index]
                        chatDataStr := row[1]
                        
                        if (chatDataStr) {
                            try {
                                chatData := ParseJSON(chatDataStr)
                                
                                if (chatData && chatData.Has("tabs") && chatData["tabs"].Length > 0) {
                                    ; 统计不同提取方式的数量
                                    extractStats := Map()
                                    
                                    for tab in chatData["tabs"] {
                                        if (tab.Has("bubbles") && tab["bubbles"].Length > 0) {
                                            for bubble in tab["bubbles"] {
                                                totalBubbles++
                                                
                                                ; 使用深度提取函数 (新版)
                                                sourcePath := ""
                                                txt := ExtractBubbleTextEx(bubble, 0, &sourcePath, &extractStats)

                                                ; 调试日志：记录提取来源
                                                if (txt != "" && sourcePath != "not_found") {
                                                    OutputDebug("[简单版] 从 " . sourcePath . " 提取文本，长度: " . StrLen(txt))
                                                }
                                                
                                                if (txt = "") {
                                                    noText++
                                                    ; 调试：输出 bubble 的结构信息（仅前几个字段，避免过长）
                                                    if (noText <= 3) {  ; 只输出前3个未找到文本的 bubble
                                                        bubbleKeys := ""
                                                        try {
                                                            keyCount := 0
                                                            for key in bubble {
                                                                if (keyCount < 5) {  ; 只显示前5个字段
                                                                    bubbleKeys .= key . ", "
                                                                    keyCount++
                                                                }
                                                            }
                                                            OutputDebug("[简单版] 未找到文本，bubble 包含字段: " . SubStr(bubbleKeys, 1, -2))
                                                        }
                                                    }
                                                    continue
                                                }
                                                
                                                if (StrLen(txt) < 5) {
                                                    shortText++
                                                    continue
                                                }
                                                
                                                ; 去重检查：避免重复添加相同文本
                                                if (!ExtractedTextSet.Has(txt)) {
                                                    ExtractedTextSet[txt] := true

                                                    bubbleType := bubble.Has("type") ? bubble["type"] : ""
                                                    role := (bubbleType = "user") ? "USER" : "AI"
                                                    ; 添加来源信息到节点
                                                    CurrentChatNodes.Push({ Role: role, Text: txt, Source: sourcePath, Length: StrLen(txt) })
                                                } else {
                                                    OutputDebug("[简单版] 跳过重复文本 (长度: " . StrLen(txt) . ")")
                                                }
                                            }
                                        }
                                    }
                                    
                                    ; 输出提取方式统计
                                    if (extractStats.Count > 0) {
                                        statsMsg := "[简单版] 文本提取方式统计: "
                                        for method, count in extractStats {
                                            statsMsg .= method . "=" . count . ", "
                                        }
                                        OutputDebug(SubStr(statsMsg, 1, -2))
                                    }
                                }
                            } catch as e {
                                parseErrors++
                                OutputDebug("[简单版] JSON 解析错误: " . e.Message)
                            }
                        }
                    }
                } else {
                    OutputDebug("[简单版] JSON 查询失败")
                }
            }

            ; 记录JSON解析阶段的数据量
            jsonExtracted := CurrentChatNodes.Length

            ; 总是执行正则表达式补充提取（即使JSON解析成功，也尝试提取更多数据）
            {
                beforeRegexCount := CurrentChatNodes.Length  ; 记录正则提取前的数量
                OutputDebug("[简单版] 开始执行正则表达式补充提取... (当前已有 " . beforeRegexCount . " 条数据)")
                totalRegex := 0
                shortRegex := 0
                
                ; *** 深度提取器 v2.15 - 借鉴minimax2成功策略 ***
                ; 渐进式查询策略 + 中等长度记录捕获
                
                ; 查询1: 精准结构数据（commandType/bubbles/tabs）
                sql1 := "SELECT value FROM itemTable WHERE value LIKE '%`"text`":%' AND (value LIKE '%`"commandType`":%' OR value LIKE '%bubbles%' OR value LIKE '%tabs%')"
                OutputDebug("[深度提取器 v2.15] 查询1-精准结构数据")
                db.GetTable(sql1, &table1)
OutputDebug("[深度提取器 v2.15] 查询1结果: " . table1.RowCount . " 行")
                
                ; 查询2: 宽松text查询（所有包含text的记录）
                sql2 := "SELECT value FROM itemTable WHERE value LIKE '%`"text`":%'"
                OutputDebug("[深度提取器 v2.15] 查询2-宽松text查询")
                db.GetTable(sql2, &table2)
                OutputDebug("[深度提取器 v2.15] 查询2结果: " . table2.RowCount . " 行")
                
                ; 查询3: 中等长度记录 (100-50000字符) - 借鉴minimax2策略
                sql3 := "SELECT value FROM itemTable WHERE LENGTH(value) > 100 AND LENGTH(value) <= 50000"
                OutputDebug("[深度提取器 v2.15] 查询3-中等长度记录 (100-50000)")
                db.GetTable(sql3, &table3)
                OutputDebug("[深度提取器 v2.15] 查询3结果: " . table3.RowCount . " 行")
                
                ; 查询4: 超长记录（>50000）- 捕获dalao节点的207724记录
                sql4 := "SELECT value FROM itemTable WHERE LENGTH(value) > 50000"
                OutputDebug("[深度提取器 v2.15] 查询4-超长记录 (>50000)")
                db.GetTable(sql4, &table4)
                OutputDebug("[深度提取器 v2.15] 查询4结果: " . table4.RowCount . " 行")
                
                ; 合并所有结果
                allRawValues := []
                
                ; 添加查询1结果
                if (table1.RowCount > 0) {
                    loop table1.RowCount {
                        allRawValues.Push(table1.Rows[A_Index][1])
                    }
                }
                
                ; 添加查询2结果
                if (table2.RowCount > 0) {
                    loop table2.RowCount {
                        allRawValues.Push(table2.Rows[A_Index][1])
                    }
                }
                
                ; 添加查询3结果 (中等长度记录)
                if (table3.RowCount > 0) {
                    loop table3.RowCount {
                        allRawValues.Push(table3.Rows[A_Index][1])
                    }
                }
                
                ; 添加查询4结果 (超长记录)
                if (table4.RowCount > 0) {
                    loop table4.RowCount {
                        allRawValues.Push(table4.Rows[A_Index][1])
                    }
                }
                
                OutputDebug("[深度提取器 v2.15] 合并前: " . allRawValues.Length . " 条记录")
                
                ; 不去重，让后续处理自动去重
                uniqueValues := allRawValues
                
                OutputDebug("[深度提取器 v2.15] 不去重，保留: " . uniqueValues.Length . " 条记录")
                
                ; 创建虚拟table对象
                table := {RowCount: uniqueValues.Length}
                table.Rows := []
                for raw in uniqueValues {
                    table.Rows.Push([raw])
                }
                
                if (table.RowCount > 0) {
                    OutputDebug("[简单版] 正则查询返回 " . table.RowCount . " 行")

                    ; 分析查询结果的样本
                    if (table.RowCount > 0) {
                        sampleCount := Min(table.RowCount, 3)
                        OutputDebug("[简单版] 前 " . sampleCount . " 条记录样本:")
                        loop sampleCount {
                            row := table.Rows[A_Index]
                            raw := row[1]
                            ; 显示前200个字符作为样本
                            sample := SubStr(raw, 1, 200)
                            if (StrLen(raw) > 200) {
                                sample .= "..."
                            }
                            OutputDebug("[简单版]   样本 " . A_Index . ": " . sample)
                        }
                    }
                    loop table.RowCount {
                        row := table.Rows[A_Index]
                        raw := row[1]

                        ; 调试：记录每条记录的基本信息
                        recordLength := StrLen(raw)
                        if (A_Index <= 5) {  ; 只记录前5条记录的信息
                            OutputDebug("[简单版] 处理记录 " . A_Index . " (长度: " . recordLength . ")")
                        }

                        ; 首先尝试通用JSON文本提取
                        extractedFromJSON := ExtractTextFromJSON(raw, &jsonTexts)
                        if (extractedFromJSON > 0) {
                            OutputDebug("[简单版] 记录 " . A_Index . " 从JSON中提取到 " . extractedFromJSON . " 个文本片段")
                            for txt in jsonTexts {
                                totalRegex++
                                ; 跳过太短的文本
                                if (StrLen(txt) < 2) {
                                    shortRegex++
                                    continue
                                }

                                ; 去重检查
                                if (!ExtractedTextSet.Has(txt)) {
                                    ExtractedTextSet[txt] := true
                                    
                                    ; 改进的角色识别逻辑
                                    isUser := false
                                    
                                    ; 方法1: 检查commandType（用户命令标志）
                                    ; commandType":4" 通常表示用户输入
                                    if (InStr(raw, 'commandType":4') && InStr(raw, '"text":"' . txt)) {
                                        isUser := true
                                    }
                                    
                                    ; 方法2: 检查文本特征
                                    if (!isUser) {
                                        ; 用户消息通常以特定词开头
                                        userPatterns := "^(修改|请|如何|帮我|为什么|编写|帮我|给我|我想|你能|请帮我|能否|是否|有没有|请问|能不能|给我个|给我一个|生成|创建|写一个|实现|修复|优化|重构|解释|说明|告诉我|查找|搜索|Give me|Can you|Please|How to|Why|Create|Make|Fix|Optimize|Explain|Write|Generate)"
                                        if (RegExMatch(txt, "i)" . userPatterns)) {
                                            isUser := true
                                        }
                                    }
                                    
                                    ; 方法3: AI响应特征
                                    if (!isUser) {
                                        aiPatterns := "(Here is|以下|推荐|建议|修改|优化|代码|Implementation|Explanation|Solution|分析|解答|回复|结果|answer|response|solution|explanation)"
                                        if (RegExMatch(txt, "i)" . aiPatterns)) {
                                            isUser := false
                                        }
                                    }
                                    
                                    CurrentChatNodes.Push({ Role: isUser ? "USER" : "AI", Text: txt })
                                    if (A_Index <= 5 && totalRegex <= 20) {  ; 只记录前几条的详细信息
                                        roleLabel := isUser ? "USER" : "AI"
                                        OutputDebug("[简单版]   提取文本 [" . roleLabel . "] (长度:" . StrLen(txt) . "): " . SubStr(txt, 1, 50) . (StrLen(txt) > 50 ? "..." : ""))
                                    }
                                } else {
                                    if (A_Index <= 5) {
                                        OutputDebug("[简单版]   跳过重复文本 (长度:" . StrLen(txt) . ")")
                                    }
                                }
                            }
                        } else {
                            ; 如果通用提取失败，回退到传统字段提取
                            OutputDebug("[简单版] 记录 " . A_Index . " JSON提取失败，尝试字段提取...")
                            
                            ; 借鉴minimax2的精准字段列表
                            fieldPatterns := ["code", "codeBlock", "implementation", "suggestions", "changes", "diff", "fixes", "modifications", "codeAnalysis", "text", "content", "richText", "message"]

                            extractedFromFields := 0
                            for field in fieldPatterns {
                                ; 使用minimax2的StrSplit方式 - 更高效
                                chunks := StrSplit(raw, '"' . field . '":"')
                                for i, chunk in chunks {
                                    if (i <= 1) {
                                        continue  ; 跳过第一个chunk（前面部分）
                                    }
                                    totalRegex++
                                    
                                    endPos := InStr(chunk, '","')
                                    if (!endPos) {
                                        endPos := InStr(chunk, '"')
                                    }
                                    if (!endPos) {
                                        continue
                                    }
                                    txt := SubStr(chunk, 1, endPos - 1)
                                    txt := StrReplace(StrReplace(txt, "\n", "`n"), '\"', '"')
                                    
                                    ; 与minimax2一致的最小长度限制
                                    minLength := InStr("|code|codeBlock|implementation|suggestions|changes|diff|fixes|modifications|codeAnalysis|", "|" . field . "|") ? 3 : 2

                                    if (StrLen(txt) < minLength) {
                                        shortRegex++
                                        continue
                                    }

                                    ; 去重检查
                                    if (!ExtractedTextSet.Has(txt)) {
                                        ExtractedTextSet[txt] := true
                                        extractedFromFields++
                                        
                                        ; 改进的角色识别逻辑
                                        isU := false
                                        
                                        ; 方法1: 检查commandType（用户命令标志）
                                        if (InStr(raw, 'commandType":4') && InStr(raw, '"text":"' . txt)) {
                                            isU := true
                                        }
                                        
                                        ; 方法2: 检查文本特征
                                        if (!isU) {
                                            userPatterns := "^(修改|请|如何|帮我|为什么|编写|帮我|给我|我想|你能|请帮我|能否|是否|有没有|请问|能不能|给我个|给我一个|生成|创建|写一个|实现|修复|优化|重构|解释|说明|告诉我|查找|搜索|Give me|Can you|Please|How to|Why|Create|Make|Fix|Optimize|Explain|Write|Generate)"
                                            if (RegExMatch(txt, "i)" . userPatterns)) {
                                                isU := true
                                            }
                                        }
                                        
                                        CurrentChatNodes.Push({ Role: isU ? "USER" : "AI", Text: txt })
                                        if (A_Index <= 3 && extractedFromFields <= 5) {
                                            roleLabel := isU ? "USER" : "AI"
                                            OutputDebug("[简单版]   从" . field . "提取 [" . roleLabel . "] (长度:" . StrLen(txt) . "): " . SubStr(txt, 1, 50) . (StrLen(txt) > 50 ? "..." : ""))
                                        }
                                    }
                                }
                            }
                            if (extractedFromFields > 0) {
                                OutputDebug("[简单版] 记录 " . A_Index . " 从字段提取到 " . extractedFromFields . " 个文本")
                            }
                        }
                    }
                    regexNewItems := CurrentChatNodes.Length - beforeRegexCount
                    OutputDebug("[简单版] 正则解析: 总计 " . totalRegex . " 条匹配，过滤掉太短 " . shortRegex . " 条，新增 " . regexNewItems . " 条数据")
                }

                ; 计算正则表达式提取的增量
                regexExtracted := CurrentChatNodes.Length - jsonExtracted
                OutputDebug("[简单版] 正则表达式补充提取了 " . regexExtracted . " 条新数据")
            }

            ; 如果JSON解析器启用且成功，显示JSON解析统计
            if (UseJScriptJSON && jsonExtracted > 0) {
                OutputDebug("[简单版] JSON 解析成功: 总计 " . totalBubbles . " 条，空文本 " . noText . " 条，太短 " . shortText . " 条，解析错误 " . parseErrors . " 条，成功添加 " . jsonExtracted . " 条")
                OutputDebug("[简单版] 提取成功率: " . Round((jsonExtracted / (totalBubbles - noText - shortText)) * 100, 2) . "%")
            }
            
            db.CloseDB()
        } else {
            OutputDebug("[简单版] ❌ 无法打开数据库: " . tempDB)
        }
        
        count := CurrentChatNodes.Length
        L := LangPack[CurrentLang]
        StatusTxt.Text := count . " " . L["items"]

        ; 输出深度提取统计信息
        if (ExtractionStats.Count > 0) {
            statsMsg := "[深度提取] 统计信息: "
            totalExtracted := 0
            for method, count in ExtractionStats {
                statsMsg .= method . "=" . count . ", "
                totalExtracted += count
            }
            OutputDebug(SubStr(statsMsg, 1, -2) . " | 总计: " . totalExtracted)
        }

        ; 输出角色分布统计
        userCount := 0
        aiCount := 0
        for node in CurrentChatNodes {
            if (node.Role = "USER") {
                userCount++
            } else {
                aiCount++
            }
        }
        OutputDebug("[深度提取] 角色分布: USER=" . userCount . ", AI=" . aiCount)

        RefreshView("")
    } catch as e {
        LogError(e, "OnProjectChange 函数处理项目切换时发生错误")
        L := LangPack[CurrentLang]
        StatusTxt.Text := L["no_data"]
        CurrentChatNodes := []
        RefreshView("")
    }
}

; JSON 解析函数
ParseJSON(jsonStr) {
    if (!IsSet(JSONScriptObj))
        return ""
    
    try {
        jsonStr := StrReplace(jsonStr, "\", "\\")
        jsonStr := StrReplace(jsonStr, "`n", "\n")
        jsonStr := StrReplace(jsonStr, "`r", "\r")
        jsonStr := StrReplace(jsonStr, "`t", "\t")
        jsonStr := StrReplace(jsonStr, '"', '\"')
        return JSONScriptObj.Eval("parseJson('" . jsonStr . "')")
    } catch {
        return ""
    }
}

; 深度提取 bubble 中的文本内容（支持多种嵌套结构）
ExtractBubbleText(bubble, &debugInfo := "") {
    ; 方案1: 直接获取 text 字段
    if (bubble.Has("text") && bubble["text"] != "") {
        txt := bubble["text"]
        if (IsSet(debugInfo)) {
            debugInfo := "direct_text"
        }
        return txt
    }
    
    ; 方案2: 从 modelResponse.text 获取
    if (bubble.Has("modelResponse")) {
        modelResp := bubble["modelResponse"]
        if (Type(modelResp) = "Map" || Type(modelResp) = "Object") {
            if (modelResp.Has("text") && modelResp["text"] != "") {
                txt := modelResp["text"]
                if (IsSet(debugInfo)) {
                    debugInfo := "modelResponse.text"
                }
                return txt
            }
            
            ; 方案2.1: modelResponse.content
            if (modelResp.Has("content") && modelResp["content"] != "") {
                content := modelResp["content"]
                ; 如果 content 是字符串，直接返回
                if (Type(content) = "String") {
                    if (IsSet(debugInfo)) {
                        debugInfo := "modelResponse.content"
                    }
                    return content
                }
                ; 如果 content 是数组，尝试提取第一个元素的 text
                if (Type(content) = "Array" && content.Length > 0) {
                    firstItem := content[1]
                    if (Type(firstItem) = "Map" || Type(firstItem) = "Object") {
                        if (firstItem.Has("text") && firstItem["text"] != "") {
                            if (IsSet(debugInfo)) {
                                debugInfo := "modelResponse.content[0].text"
                            }
                            return firstItem["text"]
                        }
                    }
                }
            }
            
            ; 方案2.2: modelResponse.message 或 modelResponse.data
            for key in ["message", "data", "response", "output"] {
                if (modelResp.Has(key) && modelResp[key] != "") {
                    value := modelResp[key]
                    if (Type(value) = "String") {
                        if (IsSet(debugInfo)) {
                            debugInfo := "modelResponse." . key
                        }
                        return value
                    }
                }
            }
        }
    }
    
    ; 方案3: 从 content 字段获取（可能是数组或字符串）
    if (bubble.Has("content")) {
        content := bubble["content"]
        if (Type(content) = "String" && content != "") {
            if (IsSet(debugInfo)) {
                debugInfo := "content_string"
            }
            return content
        }
        if (Type(content) = "Array" && content.Length > 0) {
            ; 遍历数组查找文本
            for item in content {
                if (Type(item) = "Map" || Type(item) = "Object") {
                    if (item.Has("text") && item["text"] != "") {
                        if (IsSet(debugInfo)) {
                            debugInfo := "content_array.text"
                        }
                        return item["text"]
                    }
                } else if (Type(item) = "String" && item != "") {
                    if (IsSet(debugInfo)) {
                        debugInfo := "content_array_string"
                    }
                    return item
                }
            }
        }
    }
    
    ; 方案4: 从 message 字段获取
    if (bubble.Has("message") && bubble["message"] != "") {
        msg := bubble["message"]
        if (Type(msg) = "String") {
            if (IsSet(debugInfo)) {
                debugInfo := "message"
            }
            return msg
        }
        if (Type(msg) = "Map" || Type(msg) = "Object") {
            if (msg.Has("text") && msg["text"] != "") {
                if (IsSet(debugInfo)) {
                    debugInfo := "message.text"
                }
                return msg["text"]
            }
        }
    }
    
    ; 方案5: 递归搜索所有可能的文本字段
    txt := RecursiveSearchText(bubble)
    if (txt != "") {
        if (IsSet(debugInfo)) {
            debugInfo := "recursive_search"
        }
        return txt
    }
    
    if (IsSet(debugInfo)) {
        debugInfo := "not_found"
    }
    return ""
}

; 递归搜索对象/数组中的文本内容（深度优先，限制深度避免无限递归）
RecursiveSearchText(obj, depth := 0, maxDepth := 5) {
    ; 深度限制和类型检查
    if (depth >= maxDepth || !obj) {
        return ""
    }

    objType := Type(obj)

    ; 如果是字符串且长度足够，返回
    if (objType = "String") {
        trimmed := Trim(obj)
        if (StrLen(trimmed) >= 5) {
            return trimmed
        }
        return ""
    }

    ; 如果是 Map 或 Object，遍历所有键值对
    if (objType = "Map" || objType = "Object") {
        try {
            ; 优先检查代码和文本字段名（代码字段优先）
            priorityKeys := ["code", "codeBlock", "implementation", "suggestions", "changes", "diff", "fixes", "modifications", "codeAnalysis", "text", "content", "message", "data", "response", "output", "body", "value"]
            for key in priorityKeys {
                if (obj.Has(key)) {
                    result := RecursiveSearchText(obj[key], depth + 1, maxDepth)
                    if (result != "") {
                        return result
                    }
                }
            }

            ; 遍历所有其他键，限制遍历数量避免性能问题
            keyCount := 0
            for key, value in obj {
                keyCount++
                if (keyCount > 20) {  ; 限制遍历键的数量
                    break
                }
                ; 跳过已检查的优先级键
                if (InStr("|text|content|message|data|response|output|body|value|", "|" . key . "|")) {
                    continue
                }
                result := RecursiveSearchText(value, depth + 1, maxDepth)
                if (result != "") {
                    return result
                }
            }
        } catch as e {
            ; 忽略对象遍历错误，避免崩溃
            OutputDebug("[RecursiveSearchText] 遍历对象失败 (深度 " . depth . "): " . e.Message)
        }
    }

    ; 如果是数组，遍历所有元素，限制数量
    if (objType = "Array") {
        try {
            loop Min(obj.Length, 10) {  ; 限制数组遍历数量
                result := RecursiveSearchText(obj[A_Index], depth + 1, maxDepth)
                if (result != "") {
                    return result
                }
            }
        } catch as e {
            ; 忽略数组遍历错误
            OutputDebug("[RecursiveSearchText] 遍历数组失败 (深度 " . depth . "): " . e.Message)
        }
    }

    return ""
}

; ======================================================
; 深度 AI 对话提取器（方案A+B结合）
; ======================================================

; 递归解析 JSON 字符串，支持嵌套解包（方案A核心）
ParseJSONRecursive(jsonStr, depth := 0, &sourcePath := "") {
    global ExtractionMaxDepth, UseJScriptJSON, JSONScriptObj

    if (jsonStr = "" || depth >= ExtractionMaxDepth) {
        return ""
    }

    ; 方案1: 使用 JScript JSON 解析
    if (UseJScriptJSON) {
        try {
            ; 基础转义
            tempStr := StrReplace(jsonStr, "\", "\\")
            tempStr := StrReplace(tempStr, "`n", "\n")
            tempStr := StrReplace(tempStr, "`r", "\r")
            tempStr := StrReplace(tempStr, "`t", "\t")
            tempStr := StrReplace(tempStr, '"', '\"')

            ; 执行解析
            result := JSONScriptObj.Eval("parseJson('" . tempStr . "')")

            ; 递归解包：如果解析结果是字符串且像 JSON，继续解析
            if (Type(result) = "String") {
                trimmed := LTrim(result)
                if (SubStr(trimmed, 1, 1) = "{" || SubStr(trimmed, 1, 1) = "[") {
                    OutputDebug("[ParseJSONRecursive] 深度 " . depth . " 检测到嵌套 JSON，继续递归...")
                    sourcePath .= " -> recursive"
                    return ParseJSONRecursive(result, depth + 1, &sourcePath)
                }
            }

            return result
        } catch as e {
            OutputDebug("[ParseJSONRecursive] JScript 解析失败 (深度 " . depth . "): " . e.Message)
            return ""
        }
    }

    return ""
}

; 扩展的文本提取器（方案A核心，覆盖更多字段）
ExtractBubbleTextEx(bubble, depth := 0, &sourcePath := "", &extractionStats := unset) {
    global ExtractionPriority, ExtractionEnableRecursive

    ; 初始化统计
    if (!IsSet(extractionStats)) {
        extractionStats := Map()
    }

    ; 边界检查
    if (!bubble || depth > 10) {  ; 防止过度递归
        sourcePath := "invalid_input"
        return ""
    }

    ; 方案1: 代码相关字段（最高优先级）
    if (bubble.Has("modelResponse")) {
        modelResp := bubble["modelResponse"]
        if (Type(modelResp) = "Map" || Type(modelResp) = "Object") {
            ; 代码字段优先级提取
            codeFields := ["code", "codeBlock", "implementation", "suggestions", "changes", "diff", "fixes", "modifications", "codeAnalysis"]

            for field in codeFields {
                if (modelResp.Has(field)) {
                    fieldValue := modelResp[field]
                    if (Type(fieldValue) = "String" && fieldValue != "") {
                        txt := StrReplace(StrReplace(fieldValue, "\n", "`n"), '\"', '"')
                        if (StrLen(txt) >= 3) {
                            sourcePath := "modelResponse." . field
                            extractionStats[sourcePath] := extractionStats.Has(sourcePath) ? extractionStats[sourcePath] + 1 : 1
                            OutputDebug("[ExtractBubbleTextEx] 提取成功: " . sourcePath . " (长度: " . StrLen(txt) . ", 可能是代码)")
                            return txt
                        }
                    }
                    ; 如果是数组，提取第一个元素
                    if (Type(fieldValue) = "Array" && fieldValue.Length > 0) {
                        firstItem := fieldValue[1]
                        if (Type(firstItem) = "String" && firstItem != "") {
                            txt := StrReplace(StrReplace(firstItem, "\n", "`n"), '\"', '"')
                            if (StrLen(txt) >= 3) {
                                sourcePath := "modelResponse." . field . "[0]"
                                extractionStats[sourcePath] := extractionStats.Has(sourcePath) ? extractionStats[sourcePath] + 1 : 1
                                OutputDebug("[ExtractBubbleTextEx] 提取成功: " . sourcePath . " (长度: " . StrLen(txt) . ", 可能是代码)")
                                return txt
                            }
                        }
                    }
                }
            }

            ; 方案1.1: modelResponse.text（如果不是代码，继续检查）
            if (modelResp.Has("text") && modelResp["text"] != "") {
                txt := StrReplace(StrReplace(modelResp["text"], "\n", "`n"), '\"', '"')
                if (StrLen(txt) >= 3) {
                    sourcePath := "modelResponse.text"
                    extractionStats["modelResponse.text"] := extractionStats.Has("modelResponse.text") ? extractionStats["modelResponse.text"] + 1 : 1
                    OutputDebug("[ExtractBubbleTextEx] 提取成功: modelResponse.text (长度: " . StrLen(txt) . ")")
                    return txt
                }
            }

            ; 方案1.1: modelResponse.richText
            if (modelResp.Has("richText")) {
                richText := modelResp["richText"]
                if (Type(richText) = "String" && richText != "") {
                    txt := StrReplace(StrReplace(richText, "\n", "`n"), '\"', '"')
                    if (StrLen(txt) >= 3) {
                        sourcePath := "modelResponse.richText"
                        extractionStats["modelResponse.richText"] := extractionStats.Has("modelResponse.richText") ? extractionStats["modelResponse.richText"] + 1 : 1
                        OutputDebug("[ExtractBubbleTextEx] 提取成功: modelResponse.richText (长度: " . StrLen(txt) . ")")
                        return txt
                    }
                }
                ; 如果 richText 是对象，递归提取
                if ((Type(richText) = "Map" || Type(richText) = "Object") && ExtractionEnableRecursive) {
                    recursivePath := "modelResponse.richText"
                    txt := RecursiveSearchText(richText, depth, 3)  ; 限制深度
                    if (txt != "") {
                        sourcePath := recursivePath . " -> recursive"
                        extractionStats["modelResponse.richText_recursive"] := extractionStats.Has("modelResponse.richText_recursive") ? extractionStats["modelResponse.richText_recursive"] + 1 : 1
                        OutputDebug("[ExtractBubbleTextEx] 提取成功: modelResponse.richText -> recursive (长度: " . StrLen(txt) . ")")
                        return txt
                    }
                }
            }

            ; 方案1.2: modelResponse.content
            if (modelResp.Has("content")) {
                content := modelResp["content"]
                if (Type(content) = "String" && content != "") {
                    txt := StrReplace(StrReplace(content, "\n", "`n"), '\"', '"')
                    if (StrLen(txt) >= 3) {
                        sourcePath := "modelResponse.content"
                        extractionStats["modelResponse.content"] := extractionStats.Has("modelResponse.content") ? extractionStats["modelResponse.content"] + 1 : 1
                        OutputDebug("[ExtractBubbleTextEx] 提取成功: modelResponse.content (长度: " . StrLen(txt) . ")")
                        return txt
                    }
                }
                if (Type(content) = "Array" && content.Length > 0) {
                    for item in content {
                        if (Type(item) = "Map" || Type(item) = "Object") {
                            if (item.Has("text") && item["text"] != "") {
                                txt := StrReplace(StrReplace(item["text"], "\n", "`n"), '\"', '"')
                                if (StrLen(txt) >= 3) {
                                    sourcePath := "modelResponse.content[].text"
                                    extractionStats["modelResponse.content_array"] := extractionStats.Has("modelResponse.content_array") ? extractionStats["modelResponse.content_array"] + 1 : 1
                                    OutputDebug("[ExtractBubbleTextEx] 提取成功: modelResponse.content[].text (长度: " . StrLen(txt) . ")")
                                    return txt
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    ; 方案2: bubble级别代码字段
    codeFields := ["code", "codeBlock", "implementation", "suggestions", "changes", "diff", "fixes", "modifications", "codeAnalysis"]

    for field in codeFields {
        if (bubble.Has(field)) {
            fieldValue := bubble[field]
            if (Type(fieldValue) = "String" && fieldValue != "") {
                txt := StrReplace(StrReplace(fieldValue, "\n", "`n"), '\"', '"')
                if (StrLen(txt) >= 3) {
                    sourcePath := "bubble." . field
                    extractionStats[sourcePath] := extractionStats.Has(sourcePath) ? extractionStats[sourcePath] + 1 : 1
                    OutputDebug("[ExtractBubbleTextEx] 提取成功: " . sourcePath . " (长度: " . StrLen(txt) . ", 可能是代码)")
                    return txt
                }
            }
            ; 如果是数组，提取第一个元素
            if (Type(fieldValue) = "Array" && fieldValue.Length > 0) {
                firstItem := fieldValue[1]
                if (Type(firstItem) = "String" && firstItem != "") {
                    txt := StrReplace(StrReplace(firstItem, "\n", "`n"), '\"', '"')
                    if (StrLen(txt) >= 3) {
                        sourcePath := "bubble." . field . "[0]"
                        extractionStats[sourcePath] := extractionStats.Has(sourcePath) ? extractionStats[sourcePath] + 1 : 1
                        OutputDebug("[ExtractBubbleTextEx] 提取成功: " . sourcePath . " (长度: " . StrLen(txt) . ", 可能是代码)")
                        return txt
                    }
                }
            }
        }
    }

    ; 方案2.1: bubble.text
    if (bubble.Has("text") && bubble["text"] != "") {
        txt := StrReplace(StrReplace(bubble["text"], "\n", "`n"), '\"', '"')
        if (StrLen(txt) >= 3) {
            sourcePath := "bubble.text"
            extractionStats["bubble.text"] := extractionStats.Has("bubble.text") ? extractionStats["bubble.text"] + 1 : 1
            OutputDebug("[ExtractBubbleTextEx] 提取成功: bubble.text (长度: " . StrLen(txt) . ")")
            return txt
        }
    }

    ; 方案3: bubble.richText
    if (bubble.Has("richText")) {
        richText := bubble["richText"]
        if (Type(richText) = "String" && richText != "") {
            txt := StrReplace(StrReplace(richText, "\n", "`n"), '\"', '"')
            if (StrLen(txt) >= 3) {
                sourcePath := "bubble.richText"
                extractionStats["bubble.richText"] := extractionStats.Has("bubble.richText") ? extractionStats["bubble.richText"] + 1 : 1
                OutputDebug("[ExtractBubbleTextEx] 提取成功: bubble.richText (长度: " . StrLen(txt) . ")")
                return txt
            }
        }
    }

    ; 方案4: bubble.content
    if (bubble.Has("content")) {
        content := bubble["content"]
        if (Type(content) = "String" && content != "") {
            txt := StrReplace(StrReplace(content, "\n", "`n"), '\"', '"')
            if (StrLen(txt) >= 3) {
                sourcePath := "bubble.content"
                extractionStats["bubble.content"] := extractionStats.Has("bubble.content") ? extractionStats["bubble.content"] + 1 : 1
                OutputDebug("[ExtractBubbleTextEx] 提取成功: bubble.content (长度: " . StrLen(txt) . ")")
                return txt
            }
        }
    }

    ; 方案5: bubble.message.text
    if (bubble.Has("message")) {
        msg := bubble["message"]
        if (Type(msg) = "Map" || Type(msg) = "Object") {
            if (msg.Has("text") && msg["text"] != "") {
                txt := StrReplace(StrReplace(msg["text"], "\n", "`n"), '\"', '"')
                if (StrLen(txt) >= 3) {
                    sourcePath := "bubble.message.text"
                    extractionStats["bubble.message.text"] := extractionStats.Has("bubble.message.text") ? extractionStats["bubble.message.text"] + 1 : 1
                    OutputDebug("[ExtractBubbleTextEx] 提取成功: bubble.message.text (长度: " . StrLen(txt) . ")")
                    return txt
                }
            }
        }
    }

    ; 方案6: 递归搜索所有可能的文本字段（最低优先级）
    txt := RecursiveSearchText(bubble, depth, 3)  ; 限制深度
    if (txt != "") {
        sourcePath := "recursive_search"
        extractionStats["recursive_search"] := extractionStats.Has("recursive_search") ? extractionStats["recursive_search"] + 1 : 1
        OutputDebug("[ExtractBubbleTextEx] 提取成功: recursive_search (长度: " . StrLen(txt) . ")")
        return txt
    }

    ; 未找到
    sourcePath := "not_found"
    extractionStats["not_found"] := extractionStats.Has("not_found") ? extractionStats["not_found"] + 1 : 1
    OutputDebug("[ExtractBubbleTextEx] 未找到文本")
    return ""
}

; 代码内容识别函数
IsCodeContent(text) {
    if (StrLen(text) < 10) {
        return false
    }

    ; 检查是否包含代码块标记
    marker := Chr(96) . Chr(96) . Chr(96)  ; 三个反引号
    if (InStr(text, marker)) {
        return true
    }

    ; 检查缩进模式（4个空格或制表符）
    lines := StrSplit(text, "`n")
    indentedLines := 0
    totalLines := lines.Length

    if (totalLines > 3) {
        for line in lines {
            lineTrim := LTrim(line)
            if (StrLen(line) - StrLen(lineTrim) >= 4 || SubStr(line, 1, 1) = "`t") {
                indentedLines++
            }
        }
        if (indentedLines / totalLines > 0.6) {
            return true
        }
    }

    ; 检查编程语言关键字密度
    keywords := ["function", "class", "import", "export", "const", "let", "var", "def ", "public ", "private ", "void ", "int ", "string ", "if ", "for ", "while ", "try ", "catch "]
    keywordCount := 0

    for keyword in keywords {
        if (InStr(text, keyword)) {
            keywordCount++
        }
    }

    ; 如果关键字密度较高，认为是代码
    if (keywordCount >= 2) {
        return true
    }

    return false
}

; 通用文本提取函数 - 从任意JSON字符串中提取所有可能的文本内容（v2.2增强版）
ExtractTextFromJSON(jsonStr, &extractedTexts := unset) {
    if (!IsSet(extractedTexts)) {
        extractedTexts := []
    }

    ; 记录原始字符串用于调试
    originalLength := StrLen(jsonStr)
    
    ; 方法1: 使用正则表达式匹配所有 "key":"value" 模式（扩展字段列表）
    ; 包含AI响应的所有可能字段
    patterns := [
        '"text"\s*:\s*"([^"]*)"',           ; "text":"value" - 基础文本字段
        '"content"\s*:\s*"([^"]*)"',        ; "content":"value" - 内容字段
        '"richText"\s*:\s*"([^"]*)"',       ; "richText":"value" - 富文本字段
        '"message"\s*:\s*"([^"]*)"',        ; "message":"value" - 消息字段
        '"code"\s*:\s*"([^"]*)"',           ; "code":"value" - 代码字段（高优先级）
        '"codeBlock"\s*:\s*"([^"]*)"',      ; "codeBlock":"value" - 代码块字段
        '"implementation"\s*:\s*"([^"]*)"', ; "implementation":"value" - 实现字段
        '"suggestions"\s*:\s*"([^"]*)"',    ; "suggestions":"value" - 建议字段
        '"changes"\s*:\s*"([^"]*)"',        ; "changes":"value" - 修改字段
        '"diff"\s*:\s*"([^"]*)"',           ; "diff":"value" - 差异字段
        '"fixes"\s*:\s*"([^"]*)"',          ; "fixes":"value" - 修复字段
        '"modifications"\s*:\s*"([^"]*)"',  ; "modifications":"value" - 修改字段
        '"codeAnalysis"\s*:\s*"([^"]*)"',   ; "codeAnalysis":"value" - 代码分析字段
        '"explanation"\s*:\s*"([^"]*)"',    ; "explanation":"value" - 解释字段
        '"reasoning"\s*:\s*"([^"]*)"',      ; "reasoning":"value" - 推理字段
        '"summary"\s*:\s*"([^"]*)"',        ; "summary":"value" - 总结字段
        '"response"\s*:\s*"([^"]*)"',       ; "response":"value" - 响应字段
        '"result"\s*:\s*"([^"]*)"',         ; "result":"value" - 结果字段
        '"answer"\s*:\s*"([^"]*)"',         ; "answer":"value" - 回答字段
        '"output"\s*:\s*"([^"]*)"',         ; "output":"value" - 输出字段
        '"data"\s*:\s*"([^"]*)"',           ; "data":"value" - 数据字段
        '"body"\s*:\s*"([^"]*)"',           ; "body":"value" - 主体字段
        '"value"\s*:\s*"([^"]*)"',          ; "value":"value" - 值字段
        '"snippet"\s*:\s*"([^"]*)"',        ; "snippet":"value" - 片段字段
        '"description"\s*:\s*"([^"]*)"',    ; "description":"value" - 描述字段
        '"reason"\s*:\s*"([^"]*)"',         ; "reason":"value" - 原因字段
        '"thought"\s*:\s*"([^"]*)"',        ; "thought":"value" - 思考字段
        '"analysis"\s*:\s*"([^"]*)"',       ; "analysis":"value" - 分析字段
        '"commentary"\s*:\s*"([^"]*)"',     ; "commentary":"value" - 注释字段
        '"context"\s*:\s*"([^"]*)"',        ; "context":"value" - 上下文字段
        '"insight"\s*:\s*"([^"]*)"',        ; "insight":"value" - 见解字段
        '"recommendation"\s*:\s*"([^"]*)"', ; "recommendation":"value" - 推荐字段
        '"step"\s*:\s*"([^"]*)"',           ; "step":"value" - 步骤字段
        '"explanation"\s*:\s*"([^"]*)"',    ; "explanation":"value" - 说明字段
        '"reasoning"\s*:\s*"([^"]*)"',      ; "reasoning":"value" - 推理字段
        '"justification"\s*:\s*"([^"]*)"',  ; "justification":"value" - 正当性字段
        '"elaboration"\s*:\s*"([^"]*)"',    ; "elaboration":"value" - 阐述字段
        '"details"\s*:\s*"([^"]*)"',        ; "details":"value" - 详情字段
        '"information"\s*:\s*"([^"]*)"',    ; "information":"value" - 信息字段
        '"feedback"\s*:\s*"([^"]*)"',       ; "feedback":"value" - 反馈字段
        '"conclusion"\s*:\s*"([^"]*)"',     ; "conclusion":"value" - 结论字段
        '"observation"\s*:\s*"([^"]*)"',    ; "observation":"value" - 观察字段
        '"finding"\s*:\s*"([^"]*)"',        ; "finding":"value" - 发现字段
        '"interpretation"\s*:\s*"([^"]*)"', ; "interpretation":"value" - 解释字段
        '"insight"\s*:\s*"([^"]*)"',        ; "insight":"value" - 洞察字段
        '"perspective"\s*:\s*"([^"]*)"',    ; "perspective":"value" - 观点字段
        '"viewpoint"\s*:\s*"([^"]*)"',      ; "viewpoint":"value" - 观点字段
        '"assessment"\s*:\s*"([^"]*)"',     ; "assessment":"value" - 评估字段
        '"evaluation"\s*:\s*"([^"]*)"',     ; "evaluation":"value" - 评价字段
        '"comment"\s*:\s*"([^"]*)"',        ; "comment":"value" - 注释字段
        '"note"\s*:\s*"([^"]*)"',           ; "note":"value" - 备注字段
        '"remark"\s*:\s*"([^"]*)"',         ; "remark":"value" - 评注字段
    ]

    extractedCount := 0
    for pattern in patterns {
        matches := []
        startPos := 1
        while (RegExMatch(jsonStr, pattern, &match, startPos)) {
            text := match[1]
            ; 解码转义字符
            text := StrReplace(text, "\n", "`n")
            text := StrReplace(text, "\r", "`r")
            text := StrReplace(text, "\t", "`t")
            text := StrReplace(text, '\"', '"')
            text := StrReplace(text, '\\', '\')

            ; 只保留有意义的长文本，降低阈值以捕获更多内容
            if (StrLen(text) >= 2 && text != "null" && text != "" && text != " " && text != "`n") {
                ; 额外过滤：避免太短的纯标点或符号
                if (StrLen(text) >= 2) {
                    extractedTexts.Push(text)
                    extractedCount++
                }
            }
            startPos := match.Pos + match.Len
        }
    }

    ; 方法2: 提取数组中的文本（处理 ["text1", "text2"] 格式）
    ; 使用简化模式避免 PCRE 回溯限制错误
    ; 匹配 [...] 内的第一个文本片段，避免复杂回溯
    arrayMatch := []
    if (RegExMatch(jsonStr, '\[\s*"([^"\]]*)"\s*(?:,|\])', &arrayMatch)) {
        arrayContent := arrayMatch[1]
        ; 简单分割处理
        items := StrSplit(arrayContent, '","')
        for item in items {
            item := Trim(item, '"')
            if (StrLen(item) >= 2 && item != "null" && item != "" && item != " " && item != "`n") {
                extractedTexts.Push(item)
                extractedCount++
            }
        }
    }

    ; 方法3: 提取长文本片段（可能包含AI响应内容）
    ; 查找长度超过100字符的连续文本（可能包含完整响应）
    longTextPattern := '"([^"]{100,})"'  ; 匹配100字符以上的文本
    startPos := 1
    while (RegExMatch(jsonStr, longTextPattern, &match, startPos)) {
        text := match[1]
        ; 解码转义字符
        text := StrReplace(text, "\n", "`n")
        text := StrReplace(text, "\r", "`r")
        text := StrReplace(text, "\t", "`t")
        text := StrReplace(text, '\"', '"')
        text := StrReplace(text, '\\', '\')

        ; 检查是否已经在列表中
        isDuplicate := false
        for existingText in extractedTexts {
            if (existingText = text) {
                isDuplicate := true
                break
            }
        }

        if (!isDuplicate && text != "null" && text != "") {
            extractedTexts.Push(text)
            extractedCount++
        }
        startPos := match.Pos + match.Len
    }

    ; 方法4: 提取可能包含代码的JSON值
    ; 查找包含编程结构的值（函数定义、类定义等）
    codePatterns := [
        '"\w+"\s*:\s*"[^"]*function\s+\w+\s*\([^"]*"',  ; 函数定义
        '"\w+"\s*:\s*"[^"]*class\s+\w+\s*[^"]*"',        ; 类定义
        '"\w+"\s*:\s*"[^"]*const\s+\w+\s*=\s*[^"]*"',    ; const定义
        '"\w+"\s*:\s*"[^"]*let\s+\w+\s*=\s*[^"]*"',      ; let定义
        '"\w+"\s*:\s*"[^"]*import\s+[^"]*"',             ; import语句
        '"\w+"\s*:\s*"[^"]*export\s+[^"]*"',            ; export语句
        '"\w+"\s*:\s*"[^"]*async\s+function\s+\w+\s*\([^"]*"'  ; async函数
    ]

    for codePattern in codePatterns {
        startPos := 1
        while (RegExMatch(jsonStr, codePattern, &match, startPos)) {
            ; 提取代码部分
            codeMatch := []
            if (RegExMatch(match[0], ':\s*"([^"]*)"', &codeMatch)) {
                text := codeMatch[1]
                text := StrReplace(text, "\n", "`n")
                text := StrReplace(text, '\"', '"')
                text := StrReplace(text, '\\', '\')

                if (StrLen(text) >= 10 && text != "null" && text != "") {
                    ; 检查重复
                    isDuplicate := false
                    for existingText in extractedTexts {
                        if (existingText = text) {
                            isDuplicate := true
                            break
                        }
                    }

                    if (!isDuplicate) {
                        extractedTexts.Push(text)
                        extractedCount++
                    }
                }
            }
            startPos := match.Pos + match.Len
        }
    }

    OutputDebug("[深度提取器 v2.12] 从JSON提取完成: " . extractedCount . " 个文本片段 (原始长度: " . originalLength . ")")
    return extractedCount
}

; 刷新视图
RefreshView(keyword := "") {
    global CurrentChatNodes, FilteredChatNodes, ChatListView, StatusTxt, LangPack, CurrentLang, MyGui
    
    L := LangPack[CurrentLang]
    
    ; 清空 ListView
    ChatListView.Delete()
    
    ; 过滤数据
    FilteredChatNodes := []
    if (keyword = "") {
        ; 显示所有记录，统一数据结构
        for idx, node in CurrentChatNodes {
            FilteredChatNodes.Push({OriginalIdx: idx, Node: node})
        }
    } else {
        ; 过滤记录
        for idx, node in CurrentChatNodes {
            if (InStr(node.Text, keyword)) {
                FilteredChatNodes.Push({OriginalIdx: idx, Node: node})
            }
        }
    }
    
    ; 填充 ListView
    for item in FilteredChatNodes {
        idx := item.OriginalIdx
        node := item.Node
        
        preview := SubStr(node.Text, 1, 50)
        if (StrLen(node.Text) > 50) {
            preview .= "..."
        }
        preview := StrReplace(StrReplace(preview, "`n", " "), "`r", " ")
        
        ChatListView.Add("", idx, preview)
    }
    
    ; 更新状态
    StatusTxt.Text := FilteredChatNodes.Length . " " . L["items"]
    
    ; 清空内容显示
    ContentEdit.Value := ""
}

ScanWorkspaces() {
    global AllWorkspaces, CustomDBPath
    
    if (CustomDBPath != "" && DirExist(CustomDBPath)) {
        try {
            ScanWorkspaceDir(CustomDBPath)
        } catch as e {
            OutputDebug("[数据库扫描] 自定义路径扫描失败: " . e.Message)
        }
    }
    
    dir := EnvGet("AppData") "\Cursor\User\workspaceStorage"
    if (DirExist(dir)) {
        ScanWorkspaceDir(dir)
    }
}

ScanWorkspaceDir(dir) {
    global AllWorkspaces
    
    if (FileExist(dir) && SubStr(dir, -7) = ".vscdb") {
        nm := RegExReplace(dir, ".*[\\/]([^\\/]+)\.vscdb$", "$1")
        AllWorkspaces.Push({ Name: nm, Path: dir })
        return
    }
    
    loop files, dir "\*", "D" {
        db := A_LoopFilePath "\state.vscdb"
        if (FileExist(db)) {
            nm := A_LoopFileName
            js := A_LoopFilePath "\workspace.json"
            if (FileExist(js)) {
                try {
                    if (RegExMatch(FileRead(js), '"folder\":\s*\".*[\\/](.*)\"', &m))
                        nm := m[1]
                }
            }
            AllWorkspaces.Push({ Name: nm, Path: db })
        }
    }
}

UpdateDDL() {
    global AllWorkspaces, ProjectDDL
    lst := []
    for item in AllWorkspaces
        lst.Push(item.Name)
    ProjectDDL.Delete()
    ProjectDDL.Add(lst)
}

ExportSingleData(idx, format) {
    global CurrentChatNodes
    idx := Number(idx)
    if (idx < 1 || idx > CurrentChatNodes.Length) {
        ToolTip("无效节点 ID: " . idx)
        return
    }
    
    node := CurrentChatNodes[idx]
    oldNodes := CurrentChatNodes
    CurrentChatNodes := [node]
    
    try {
        ExportData(format)
    } catch as e {
        LogError(e, "ExportSingleData 函数导出单条数据时发生错误")
        ToolTip("导出失败: " . e.Message)
        SetTimer(() => ToolTip(), -3000)
    }
    
    CurrentChatNodes := oldNodes
}

ExportData(format) {
    global CurrentChatNodes, CurrentLang
    
    if (CurrentChatNodes.Length = 0) {
        ToolTip("No Data")
        SetTimer(() => ToolTip(), -2000)
        return
    }
    
    ext := format
    defaultName := "export_" . FormatTime(, "yyyyMMdd_HHmmss") . "." . ext
    global LastExportPath
    if (LastExportPath != "" && DirExist(LastExportPath)) {
        defaultPath := LastExportPath . "\" . defaultName
    } else {
        defaultPath := A_Desktop . "\" . defaultName
    }
    
    filterText := ""
    promptText := ""
    switch format {
        case "md":
            filterText := "Markdown (*.md)"
            promptText := "保存为 Markdown 文件"
        case "json":
            filterText := "JSON (*.json)"
            promptText := "保存为 JSON 文件"
        case "txt":
            filterText := "Text (*.txt)"
            promptText := "保存为文本文件"
        case "csv":
            filterText := "CSV (*.csv)"
            promptText := "保存为 CSV 文件"
    }
    
    try {
        path := FileSelect("S16", defaultPath, promptText, filterText)
    } catch as e {
        LogError(e, "ExportData 函数调用 FileSelect 时发生错误")
        ToolTip("文件选择对话框错误: " . e.Message)
        SetTimer(() => ToolTip(), -3000)
        return
    }
    
    if (!path || path = "") {
        return
    }
    
    try {
        SplitPath(path, , &dir)
        if (dir != "") {
            global LastExportPath
            LastExportPath := dir
            SaveConfig()
        }
    } catch {
        ; 忽略错误
    }
    
    if (!RegExMatch(path, "i)\." . ext . "$")) {
        path := path . "." . ext
    }
    
    try {
        switch format {
            case "md":
                ExportMD(path)
            case "json":
                ExportJSON(path)
            case "txt":
                ExportTXT(path)
            case "csv":
                ExportCSV(path)
        }
    } catch as e {
        LogError(e, "ExportData 函数执行导出操作时发生错误")
        throw
    }
    
    if (FileExist(path)) {
        SplitPath(path, , , , &fileName)
        ToolTip("✅ 已导出: " . fileName . "`n保存位置: " . path, 20, 20)
        SetTimer(() => ToolTip(), -5000)
    }
}

ExportMD(path) {
    global CurrentChatNodes, CurrentLang
    
    L := LangPack[CurrentLang]
    
    content := "# Cursor Chat Export`n`n"
    for idx, node in CurrentChatNodes {
        content .= "## " . idx . " - " . (node.Role = "USER" ? "USER" : "AI") . "`n`n"
        content .= node.Text . "`n`n---`n`n"
    }
    
    try {
        if FileExist(path)
            FileDelete(path)
        FileAppend(content, path, "UTF-8")
    } catch as e {
        throw
    }
}

ExportJSON(path) {
    global CurrentChatNodes, CurrentLang

    dq := Chr(34)
    json := "{"
    json .= dq . "export_info" . dq . ":{"
    json .= dq . "timestamp" . dq . ":" . dq . FormatTime(, "yyyy-MM-dd HH:mm:ss") . dq . ","
    json .= dq . "total_count" . dq . ":" . dq . CurrentChatNodes.Length . dq . ","
    json .= dq . "extractor" . dq . ":" . dq . "deep_ai_extractor" . dq
    json .= "}," . dq . "conversations" . dq . ":["

    first := true
    for idx, node in CurrentChatNodes {
        role := (node.Role = "USER") ? "USER" : "AI"
        s := JsonEscape(node.Text)
        source := node.Has("Source") ? node.Source : "unknown"
        length := node.Has("Length") ? node.Length : StrLen(node.Text)

        if (!first) {
            json .= ","
        }
        first := false
        json .= "{"
        json .= dq . "idx" . dq . ":" . dq . idx . dq . ","
        json .= dq . "role" . dq . ":" . dq . role . dq . ","
        json .= dq . "source" . dq . ":" . dq . source . dq . ","
        json .= dq . "length" . dq . ":" . dq . length . dq . ","
        json .= dq . "text" . dq . ":" . dq . s . dq
        json .= "}"
    }
    json .= "]}"

    try {
        if FileExist(path)
            FileDelete(path)
        FileAppend(json, path, "UTF-8")
    } catch as e {
        throw
    }
}

JsonEscape(s) {
    s := StrReplace(s, "\", "\\")
    dq := Chr(34)
    s := StrReplace(s, dq, "\" . dq)
    s := StrReplace(s, "`n", "\n")
    s := StrReplace(s, "`r", "\r")
    return s
}

ExportTXT(path) {
    global CurrentChatNodes

    content := "=== Cursor AI 对话导出 (深度提取器) ===`n"
    content .= "导出时间: " . FormatTime(, "yyyy-MM-dd HH:mm:ss") . "`n"
    content .= "总条数: " . CurrentChatNodes.Length . "`n`n"

    for idx, node in CurrentChatNodes {
        content .= "=== " . idx . " | " . (node.Role = "USER" ? "USER" : "AI")
        if (node.Has("Source")) {
            content .= " | 来源: " . node.Source
        }
        if (node.Has("Length")) {
            content .= " | 长度: " . node.Length
        }
        content .= " ===`n"
        content .= node.Text . "`n`n"
    }

    try {
        if FileExist(path)
            FileDelete(path)
        FileAppend(content, path, "UTF-8")
    } catch as e {
        throw
    }
}

ExportCSV(path) {
    global CurrentChatNodes

    content := "ID,Role,Source,Length,Text`n"
    for idx, node in CurrentChatNodes {
        safeText := StrReplace(StrReplace(node.Text, "`n", "\n"), '"', '""')
        source := node.Has("Source") ? node.Source : "unknown"
        length := node.Has("Length") ? node.Length : StrLen(node.Text)
        content .= idx . "," . (node.Role = "USER" ? "USER" : "AI") . "," . source . "," . length . "," . '"' . safeText . '"`n'
    }

    try {
        if FileExist(path)
            FileDelete(path)
        FileAppend(content, path, "UTF-8")
    } catch as e {
        throw
    }
}

; 配置托盘菜单
SetupTrayMenu() {
    A_TrayMenu.Delete()
    
    isAutoStart := CheckAutoStart()
    
    A_TrayMenu.Add("开机自启", ToggleAutoStart)
    if (isAutoStart) {
        A_TrayMenu.Check("开机自启")
    }
    
    A_TrayMenu.Add()
    A_TrayMenu.Add("帮助", OpenHelp)
    A_TrayMenu.Add("重启", RestartApp)
    A_TrayMenu.Add("关闭", CloseApp)
    
    A_TrayMenu.Default := "重启"
}

CheckAutoStart() {
    regPath := "HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
    regKey := "Curser"
    try {
        regValue := RegRead(regPath, regKey)
        scriptPath := A_ScriptFullPath
        regValueNormalized := RegExReplace(regValue, '^"|"$', "")
        scriptPathNormalized := RegExReplace(scriptPath, '^"|"$', "")
        if (regValueNormalized = scriptPathNormalized || InStr(regValueNormalized, scriptPathNormalized)) {
            return true
        }
    } catch {
    }
    return false
}

ToggleAutoStart(*) {
    regPath := "HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
    regKey := "Curser"
    isAutoStart := CheckAutoStart()
    
    try {
        if (isAutoStart) {
            RegDelete(regPath, regKey)
            A_TrayMenu.Uncheck("开机自启")
            TrayTip("开机自启已关闭", "", 0x1)
        } else {
            scriptPath := A_ScriptFullPath
            RegWrite(scriptPath, "REG_SZ", regPath, regKey)
            A_TrayMenu.Check("开机自启")
            TrayTip("开机自启已开启", "", 0x1)
        }
    } catch as e {
        TrayTip("操作失败", "无法修改开机自启设置: " . e.Message, 0x3)
    }
}

OpenHelp(*) {
    Run("https://github.com/psterman/curser/tree/main")
}

RestartApp(*) {
    Reload()
}

CloseApp(*) {
    ExitApp()
}

; 初始化
ScanWorkspaces()
UpdateDDL()
if (AllWorkspaces.Length > 0) {
    ProjectDDL.Choose(1)
    OnProjectChange(ProjectDDL)
}

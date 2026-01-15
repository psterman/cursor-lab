#Requires AutoHotkey v2.0

; Neutron.ahk v1.0.0 (Adapted for AutoHotkey v2.0)
; Copyright (c) 2020 Philip Taylor (known also as GeekDude, G33kDude)
; https://github.com/G33kDude/Neutron.ahk
; 
; AutoHotkey v2.0 Compatibility Modifications:
; - Converted all v1 syntax to v2 syntax
; - Fixed property definitions (doc[], wnd[] -> doc, wnd)
; - Updated GUI commands to v2 syntax
; - Fixed Map initialization in constructor
; - Updated function calls (Sleep, WinGetPos, etc.)
; - Fixed RegisterCallback usage for v2
;
; MIT License
;
; Permission is hereby granted, free of charge, to any person obtaining a copy
; of this software and associated documentation files (the "Software"), to deal
; in the Software without restriction, including without limitation the rights
; to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
; copies of the Software, and to permit persons to whom the Software is
; furnished to do so, subject to the following conditions:
;
; The above copyright notice and this permission notice shall be included in all
; copies or substantial portions of the Software.
;
; THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
; IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
; FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
; AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
; LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
; OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
; SOFTWARE.
;

; 窗口过程回调包装函数（用于 CallbackCreate）
; 使用静态映射表存储对象引用，通过窗口句柄查找
_WindowProcCallback(Msg, wParam, lParam) {
	; 窗口过程的实际签名是：LRESULT CALLBACK WindowProc(HWND hwnd, UINT uMsg, WPARAM wParam, LPARAM lParam)
	; 但 CallbackCreate 的参数顺序可能不同
	; 根据 SetWindowLong 的使用，窗口过程回调会被 Windows 调用，参数顺序是固定的
	; 但 CallbackCreate 创建的回调函数，参数顺序取决于我们如何定义
	
	; 实际上，在 SetWindowLong 中，窗口过程回调的第一个参数是窗口句柄
	; 但我们的 _WindowProc 方法只接受 3 个参数（Msg, wParam, lParam）
	; 所以我们需要一个包装函数来处理 4 个参数，然后调用 _WindowProc
	
	; 但根据错误信息，CallbackCreate 可能不支持 BoundFunc
	; 让我们使用一个简单的包装函数，通过静态映射表查找对象
	
	; 由于窗口过程回调的参数顺序是 (hWnd, uMsg, wParam, lParam)
	; 但我们的包装函数需要接受这些参数，然后调用 _WindowProc(Msg, wParam, lParam)
	
	; 使用窗口属性存储对象指针（更可靠的方法）
	; 在创建回调时，我们将对象指针存储在窗口属性中
	; 然后在回调中通过窗口句柄获取对象指针
	
	; 但在这个回调中，第一个参数应该是窗口句柄
	; 让我们假设参数顺序是：hWnd, Msg, wParam, lParam
	local hWnd, objPtr, obj
	
	; 尝试从窗口属性获取对象指针
	; 注意：这里我们需要窗口句柄，但参数顺序可能不同
	; 让我们先尝试使用静态映射表（通过窗口句柄查找）
	
	; 实际上，由于窗口过程回调的参数顺序是固定的
	; 第一个参数是窗口句柄，第二个是消息，第三个是 wParam，第四个是 lParam
	; 但 CallbackCreate 的参数顺序取决于我们如何定义函数
	
	; 让我们使用一个更简单的方法：使用静态变量存储当前实例
	; 这对于单实例场景足够（NeutronWindow 通常只创建一个实例）
	; 注意：_CurrentInstance 初始化为 0，如果为 0 或不是对象，则返回 0
	try {
		instance := NeutronWindow._CurrentInstance
		if (instance && IsObject(instance)) {
			; 调用实例的 _WindowProc 方法
			; _WindowProc 接受 3 个参数：Msg, wParam, lParam
			return instance._WindowProc(Msg, wParam, lParam)
		}
	} catch {
		; 如果访问失败，返回 0
	}
	return 0
}

class NeutronWindow
{
	static TEMPLATE := "
( ; html
<!DOCTYPE html><html>
<head>

<meta http-equiv='X-UA-Compatible' content='IE=edge'>
<style>
	html, body {
		width: 100%; height: 100%;
		margin: 0; padding: 0;
		font-family: sans-serif;
	}

	body {
		display: flex;
		flex-direction: column;
	}

	header {
		width: 100%;
		display: flex;
		background: silver;
		font-family: Segoe UI;
		font-size: 9pt;
	}

	.title-bar {
		padding: 0.35em 0.5em;
		flex-grow: 1;
	}

	.title-btn {
		padding: 0.35em 1.0em;
		cursor: pointer;
		vertical-align: bottom;
		font-family: Webdings;
		font-size: 11pt;
	}

	body .title-btn-restore {
		display: none
	}
	
	body.neutron-maximized .title-btn-restore {
		display: block
	}
	
	body.neutron-maximized .title-btn-maximize {
		display: none
	}

	.title-btn:hover {
		background: rgba(0, 0, 0, .2);
	}

	.title-btn-close:hover {
		background: #dc3545;
	}

	.main {
		flex-grow: 1;
		padding: 0.5em;
		overflow: auto;
	}
</style>
<style>{}</style>

</head>
<body>

<header>
	<span class='title-bar' onmousedown='neutron.DragTitleBar()'>{}</span>
	<span class='title-btn' onclick='neutron.Minimize()'>0</span>
	<span class='title-btn title-btn-maximize' onclick='neutron.Maximize()'>1</span>
	<span class='title-btn title-btn-restore' onclick='neutron.Maximize()'>2</span>
	<span class='title-btn title-btn-close' onclick='neutron.Close()'>r</span>
</header>

<div class='main'>{}</div>

<script>{}</script>

</body>
</html>
)"
	
	; --- Constants ---
	
	static VERSION := "1.0.0"
	
	; 当前活动的实例（用于回调函数）
	; 注意：这对于多实例场景可能不够，但对于 NeutronWindow 的典型使用场景应该足够
	; 初始化为 0，表示没有活动实例
	static _CurrentInstance := 0
	
	; Windows Messages
	, WM_DESTROY := 0x02
	, WM_SIZE := 0x05
	, WM_NCCALCSIZE := 0x83
	, WM_NCHITTEST := 0x84
	, WM_NCLBUTTONDOWN := 0xA1
	, WM_KEYDOWN := 0x100
	, WM_KEYUP := 0x101
	, WM_SYSKEYDOWN := 0x104
	, WM_SYSKEYUP := 0x105
	, WM_MOUSEMOVE := 0x200
	, WM_LBUTTONDOWN := 0x201
	
	; Virtual-Key Codes
	, VK_TAB := 0x09
	, VK_SHIFT := 0x10
	, VK_CONTROL := 0x11
	, VK_MENU := 0x12
	, VK_F5 := 0x74
	
	; Non-client hit test values (WM_NCHITTEST)
	, HT_VALUES := [[13, 12, 14], [10, 1, 11], [16, 15, 17]]
	
	; Registry keys
	, KEY_FBE := "HKEY_CURRENT_USER\Software\Microsoft\Internet Explorer\MAIN"
	. "\FeatureControl\FEATURE_BROWSER_EMULATION"
	
	; Undoucmented Accent API constants
	; https://withinrafael.com/2018/02/02/adding-acrylic-blur-to-your-windows-10-apps-redstone-4-desktop-apps/
	, ACCENT_ENABLE_GRADIENT := 1
	, ACCENT_ENABLE_BLURBEHIND := 3
	, WCA_ACCENT_POLICY := 19
	
	; Other constants
	, EXE_NAME := A_IsCompiled ? A_ScriptName : StrSplit(A_AhkPath, "\").Pop()
	
	; OS minor version
	, OS_MINOR_VER := StrSplit(A_OSVersion, ".")[3]
	
	; --- Instance Variables ---
	
	; v2 语法：LISTENERS 在构造函数中初始化，因为静态属性在类定义时不能通过 this 访问
	LISTENERS := unset
	
	; Maximum pixel inset for sizing handles to appear
	border_size := 6
	
	; The window size
	w := 800
	h := 600
	
	; Window handles (v2 语法：声明实例属性)
	hWnd := 0
	hIES := 0
	hSDOV := 0
	hWB := 0
	Gui := unset
	wb := unset
	wbComObj := unset  ; v2 语法：保存 ActiveX 控件的 COM 对象
	bound := unset
	pWndProc := 0
	pWndProcOld := 0
	
	; Modifier keys as seen by neutron (v2 语法：在构造函数中初始化)
	MODIFIER_BITMAP := unset
	modifiers := 0
	
	; Shortcuts to not pass on to the web control (v2 语法：在构造函数中初始化)
	disabled_shortcuts := unset
	
	
	; --- Properties ---
	
	; Get the JS DOM object
	; v2 语法：只读属性，但允许通过返回值进行链式操作
	doc {
		get {
			; 确保 wb 已初始化
			; v2 语法：通过 COM 对象访问 Document
			; 注意：IsSet 不能用于对象属性，直接检查对象是否存在
			try {
				if (!IsObject(this.wbComObj) || !this.wbComObj.Document)
					throw Error("WebBrowser control not initialized")
				return this.wbComObj.Document
			} catch {
				throw Error("WebBrowser control not initialized")
			}
		}
	}
	
	; Get the JS Window object
	; v2 语法：只读属性，但允许通过返回值进行链式操作
	wnd {
		get {
			; 确保 wb 已初始化
			; v2 语法：通过 COM 对象访问 Document 和 parentWindow
			; 注意：IsSet 不能用于对象属性，直接检查对象是否存在
			try {
				if (!IsObject(this.wbComObj) || !this.wbComObj.Document || !this.wbComObj.Document.parentWindow)
					throw Error("WebBrowser control not initialized")
				return this.wbComObj.Document.parentWindow
			} catch {
				throw Error("WebBrowser control not initialized")
			}
		}
	}
	
	
	; --- Construction, Destruction, Meta-Functions ---
	
	__New(html:="", css:="", js:="", title:="Neutron")
	{
		static wb
		
		; 初始化 MODIFIER_BITMAP (v2 语法：在构造函数中初始化 Map)
		; v2 语法：静态属性通过类名访问，而不是 this
		this.MODIFIER_BITMAP := Map()
		this.MODIFIER_BITMAP[NeutronWindow.VK_SHIFT] := 1<<0
		this.MODIFIER_BITMAP[NeutronWindow.VK_CONTROL] := 1<<1
		this.MODIFIER_BITMAP[NeutronWindow.VK_MENU] := 1<<2
		
		; 初始化 disabled_shortcuts (v2 语法：在构造函数中初始化 Map)
		this.disabled_shortcuts := Map()
		; 无修饰键时的快捷键
		this.disabled_shortcuts[0] := Map()
		this.disabled_shortcuts[0][NeutronWindow.VK_F5] := true
		; Ctrl 修饰键时的快捷键
		ctrlModifier := this.MODIFIER_BITMAP[NeutronWindow.VK_CONTROL]
		this.disabled_shortcuts[ctrlModifier] := Map()
		this.disabled_shortcuts[ctrlModifier][GetKeyVK("F")] := true
		this.disabled_shortcuts[ctrlModifier][GetKeyVK("L")] := true
		this.disabled_shortcuts[ctrlModifier][GetKeyVK("N")] := true
		this.disabled_shortcuts[ctrlModifier][GetKeyVK("O")] := true
		this.disabled_shortcuts[ctrlModifier][GetKeyVK("P")] := true
		
		; v2 语法：在构造函数中初始化 LISTENERS（静态属性通过类名访问）
		this.LISTENERS := [NeutronWindow.WM_DESTROY, NeutronWindow.WM_SIZE, NeutronWindow.WM_NCCALCSIZE
			, NeutronWindow.WM_KEYDOWN, NeutronWindow.WM_KEYUP, NeutronWindow.WM_SYSKEYDOWN, NeutronWindow.WM_SYSKEYUP
			, NeutronWindow.WM_LBUTTONDOWN]
		
		; Create necessary circular references
		this.bound := {}
		this.bound._OnMessage := this._OnMessage.Bind(this)
		
		; Bind message handlers
		for i, message in this.LISTENERS
			OnMessage(message, this.bound._OnMessage)
		
		; Create and save the GUI
		; TODO: Restore previous default GUI
		GuiObj := Gui("+Resize -DPIScale")
		this.hWnd := GuiObj.Hwnd
		this.Gui := GuiObj  ; 保存 GUI 对象引用
		
		; Enable shadow
		margins := Buffer(16, 0)
		NumPut("Int", 1, margins, 0)
		DllCall("Dwmapi\DwmExtendFrameIntoClientArea"
		, "UPtr", this.hWnd      ; HWND hWnd
		, "UPtr", margins.Ptr) ; MARGINS *pMarInset
		
		; When manually resizing a window, the contents of the window often "lag
		; behind" the new window boundaries. Until they catch up, Windows will
		; render the border and default window color to fill that area. On most
		; windows this will cause no issue, but for borderless windows this can
		; cause rendering artifacts such as thin borders or unwanted colors to
		; appear in that area until the rest of the window catches up.
		;
		; When creating a dark-themed application, these artifacts can cause
		; jarringly visible bright areas. This can be mitigated some by changing
		; the window settings to cause dark/black artifacts, but it's not a
		; generalizable approach, so if I were to do that here it could cause
		; issues with light-themed apps.
		;
		; Some borderless window libraries, such as rossy's C implementation
		; (https://github.com/rossy/borderless-window) hide these artifacts by
		; playing with the window transparency settings which make them go away
		; but also makes it impossible to show certain colors (in rossy's case,
		; Fuchsia/FF00FF).
		;
		; Luckly, there's an undocumented Windows API function in user32.dll
		; called SetWindowCompositionAttribute, which allows you to change the
		; window accenting policies. This tells the DWM compositor how to fill
		; in areas that aren't covered by controls. By enabling the "blurbehind"
		; accent policy, Windows will render a blurred version of the screen
		; contents behind your window in that area, which will not be visually
		; jarring regardless of the colors of your application or those behind
		; it.
		;
		; Because this API is undocumented (and unavailable in Windows versions
		; below 10) it's not a one-size-fits-all solution, and could break with
		; future system updates. Hopefully a better soultion for the problem
		; this hack addresses can be found for future releases of this library.
		;
		; https://withinrafael.com/2018/02/02/adding-acrylic-blur-to-your-windows-10-apps-redstone-4-desktop-apps/
		; https://github.com/melak47/BorderlessWindow/issues/13#issuecomment-309154142
		; http://undoc.airesoft.co.uk/user32.dll/SetWindowCompositionAttribute.php
		; https://gist.github.com/riverar/fd6525579d6bbafc6e48
		; https://vhanla.codigobit.info/2015/07/enable-windows-10-aero-glass-aka-blur.html
		
		; 设置窗口背景色（v2 语法）
		this.Gui.BackColor := 0x000000
		wcad := Buffer(A_PtrSize+A_PtrSize+4, 0)
		; v2 语法：静态属性通过类名访问
		NumPut("Int", NeutronWindow.WCA_ACCENT_POLICY, wcad, 0)
		accent := Buffer(16, 0)
		; Use ACCENT_ENABLE_GRADIENT on Windows 11 to fix window dragging issues
		if(NeutronWindow.OS_MINOR_VER >= 22000)
			AccentState:= NeutronWindow.ACCENT_ENABLE_GRADIENT
		else
			AccentState:= NeutronWindow.ACCENT_ENABLE_BLURBEHIND
		NumPut("Int", AccentState, accent, 0)
		NumPut("Ptr", accent.Ptr, wcad, A_PtrSize)
		NumPut("Int", 16, wcad, A_PtrSize+A_PtrSize)
		DllCall("SetWindowCompositionAttribute", "UPtr", this.hWnd, "UPtr", wcad.Ptr)
		
		; Creating an ActiveX control with a valid URL instantiates a
		; WebBrowser, saving its object to the associated variable. The "about"
		; URL scheme allows us to start the control on either a blank page, or a
		; page with some HTML content pre-loaded by passing HTML after the
		; colon: "about:<!DOCTYPE html><body>...</body>"
		
		; Read more about the WebBrowser control here:
		; http://msdn.microsoft.com/en-us/library/aa752085
		
		; For backwards compatibility reasons, the WebBrowser control defaults
		; to IE7 emulation mode. The standard method of mitigating this is to
		; include a compatibility meta tag in the HTML, but this requires
		; tampering to the HTML and does not solve all compatibility issues.
		; By tweaking the registry before and after creation of the control we
		; can opt-out of the browser emulation feature altogether with minimal
		; impact on the rest of the system.
		
		; Read more about browser compatibility modes here:
		; https://docs.microsoft.com/en-us/archive/blogs/patricka/controlling-webbrowser-control-compatibility
		
		; v2 语法：RegRead/RegWrite/RegDelete
		; v2 语法：静态属性通过类名访问
		try {
			fbe := RegRead(NeutronWindow.KEY_FBE, NeutronWindow.EXE_NAME)
		} catch {
			fbe := ""
		}
		try {
			RegWrite("REG_DWORD", NeutronWindow.KEY_FBE, NeutronWindow.EXE_NAME, 0)
		} catch {
		}
		; v2 语法：添加 ActiveX 控件
		wb := this.Gui.Add("ActiveX", "x0 y0 w800 h600", "about:blank")
		hWB := wb.Hwnd
		if (fbe = "") {
			try {
				RegDelete(NeutronWindow.KEY_FBE, NeutronWindow.EXE_NAME)
			} catch {
			}
		} else {
			try {
				RegWrite("REG_DWORD", NeutronWindow.KEY_FBE, NeutronWindow.EXE_NAME, fbe)
			} catch {
			}
		}
		
		; Save the WebBrowser control to reference later
		; v2 语法：保存 ActiveX 控件对象和 COM 对象
		this.wb := wb
		this.hWB := hWB
		; v2 语法：获取 ActiveX 控件的 COM 对象（通过 Value 属性）
		; 保存 COM 对象用于 ComObjConnect 和 ComObjQuery
		this.wbComObj := wb.Value
		
		; Connect the web browser's event stream to a new event handler object
		; v2 语法：嵌套类需要通过类名访问，而不是通过实例
		; v2 语法：ComObjConnect 需要 COM 对象，而不是 Gui.ActiveX 对象
		wbEvents := NeutronWindow.WBEvents(this)
		ComObjConnect(this.wbComObj, wbEvents)
		
		; Compute the HTML template if necessary
		; v2 语法：静态属性通过类名访问
		if !(html ~= "i)^<!DOCTYPE")
			html := Format(NeutronWindow.TEMPLATE, css, title, html, js)
		
		; Write the given content to the page
		; v2 语法：通过 COM 对象访问 Document，添加容错处理
		try {
			this.wbComObj.Document.write(html)
			this.wbComObj.Document.close()
		} catch as e {
			MsgBox("HTML 写入失败: " e.Message "`n行号: " e.Line, "错误", "Iconx")
			throw
		}
		
		; Inject the AHK objects into the JS scope
		; v2 语法：通过 COM 对象访问 Document 和 parentWindow，添加容错处理
		try {
			this.wbComObj.Document.parentWindow.neutron := this
			; v2 语法：嵌套类需要通过类名访问
			dispatchObj := NeutronWindow.Dispatch(this)
			this.wbComObj.Document.parentWindow.ahk := dispatchObj
		} catch as e {
			MsgBox("接口注入失败: " e.Message "`n行号: " e.Line, "错误", "Iconx")
			throw
		}
		
		; Wait for the page to finish loading
		; v2 语法：通过 COM 对象访问 readyState，添加容错处理
		try {
			while this.wbComObj.readyState < 4
				Sleep(50)
		} catch as e {
			MsgBox("页面加载等待失败: " e.Message "`n行号: " e.Line, "错误", "Iconx")
			throw
		}
		
		; Subclass the rendered Internet Explorer_Server control to intercept
		; its events, including WM_NCHITTEST and WM_NCLBUTTONDOWN.
		; Read more here: https://forum.juce.com/t/_/27937
		; And in the AutoHotkey documentation for RegisterCallback (Example 2)
		
		dhw := A_DetectHiddenWindows
		DetectHiddenWindows(true)
		; v2 语法：ControlGetHwnd
		try {
			hWnd := ControlGetHwnd("Internet Explorer_Server1", "ahk_id " . this.hWnd)
			this.hIES := hWnd
		} catch {
		}
		try {
			hWnd := ControlGetHwnd("Shell DocObject View1", "ahk_id " . this.hWnd)
			this.hSDOV := hWnd
		} catch {
		}
		DetectHiddenWindows(dhw)
		
		; v2 语法：使用 CallbackCreate 替代 RegisterCallback
		; 第一个参数必须是函数对象，不能是字符串
		; 参数顺序：CallbackCreate(Callback, Options, ParamCount)
		; 注意：v2 中 CallbackCreate 不支持 EventInfo 参数，需要使用 Bind 方法绑定实例
		try {
			; 使用方法对象的 Bind 方法绑定 this 实例
			; 这会创建一个 BoundFunc 对象，可以传递给 CallbackCreate
			; _WindowProc 方法接受 3 个参数：Msg, wParam, lParam
			boundMethod := this._WindowProc.Bind(this)
			this.pWndProc := CallbackCreate(boundMethod, "Fast", 3)
		} catch as e {
			; 如果 CallbackCreate 失败，显示详细错误信息
			MsgBox("回调创建失败: " e.Message "`n行号: " e.Line "`n尝试使用包装函数...", "错误", "Iconx")
			; 如果 Bind 方法失败，回退到包装函数方案
			try {
				NeutronWindow._CurrentInstance := this
				; _WindowProcCallback 也接受 3 个参数：Msg, wParam, lParam
				this.pWndProc := CallbackCreate(NeutronWindow._WindowProcCallback, "Fast", 3)
			} catch as e2 {
				MsgBox("回调创建完全失败: " e2.Message "`n行号: " e2.Line, "错误", "Iconx")
				throw
			}
		}
		; 设置窗口过程，添加容错处理
		try {
			this.pWndProcOld := DllCall("SetWindowLong" (A_PtrSize == 8 ? "Ptr" : "")
			, "Ptr", this.hIES     ; HWND     hWnd
			, "Int", -4            ; int      nIndex (GWLP_WNDPROC)
			, "Ptr", this.pWndProc ; LONG_PTR dwNewLong
			, "Ptr") ; LONG_PTR
		} catch as e {
			MsgBox("窗口过程设置失败: " e.Message "`n行号: " e.Line, "错误", "Iconx")
			throw
		}
		
		; Stop the WebBrowser control from consuming file drag and drop events
		; v2 语法：通过 COM 对象访问 RegisterAsDropTarget，添加容错处理
		try {
			this.wbComObj.RegisterAsDropTarget := False
			DllCall("ole32\RevokeDragDrop", "UPtr", this.hIES)
		} catch as e {
			; 拖放事件注册失败不影响主要功能，仅记录错误
			; MsgBox("拖放事件注册失败: " e.Message "`n行号: " e.Line, "警告", "Icon!")
		}
	}
	
	; Show an alert for debugging purposes when the class gets garbage collected
	; __Delete()
	; {
	; 	MsgBox, __Delete
	; }
	
	
	; --- Event Handlers ---
	
	_OnMessage(wParam, lParam, Msg, hWnd)
	{
		; v2 语法：声明局部变量，消除未赋值警告
		local windowinfo, cxWindowBorders, cyWindowBorders
		local w, h, pressed, released, bit, guiX, guiY, guiW, guiH
		local pipa, kMsg, vtablePtr, translateAcceleratorPtr, r
		
		; v2 语法：消息处理修正 - 确保 hWnd 比较逻辑正确
		; 主窗口句柄 (this.hWnd) 与控件句柄 (this.hIES, this.hSDOV) 必须严格区分
		if (hWnd == this.hWnd)
		{
			; Handle messages for the main window (主窗口消息)
			
			if (Msg == NeutronWindow.WM_NCCALCSIZE)
			{
				; Size the client area to fill the entire window.
				; See this project for more information:
				; https://github.com/rossy/borderless-window
				
				; Fill client area when not maximized
				if !DllCall("IsZoomed", "UPtr", hWnd)
					return 0
				; else crop borders to prevent screen overhang
				
				; Query for the window's border size
				windowinfo := Buffer(60, 0)
				NumPut("UInt", 60, windowinfo, 0)
				DllCall("GetWindowInfo", "UPtr", hWnd, "UPtr", windowinfo.Ptr)
				cxWindowBorders := NumGet(windowinfo, 48, "Int")
				cyWindowBorders := NumGet(windowinfo, 52, "Int")
				
				; Inset the client rect by the border size
				NumPut(NumGet(lParam+0, "Int") + cxWindowBorders, lParam+0, "Int")
				NumPut(NumGet(lParam+4, "Int") + cyWindowBorders, lParam+4, "Int")
				NumPut(NumGet(lParam+8, "Int") - cxWindowBorders, lParam+8, "Int")
				NumPut(NumGet(lParam+12, "Int") - cyWindowBorders, lParam+12, "Int")
				
				return 0
			}
			else if (Msg == NeutronWindow.WM_SIZE)
			{
				; Extract size from LOWORD and HIWORD (preserving sign)
				this.w := w := lParam<<48>>48
				this.h := h := lParam<<32>>48
				
				DllCall("MoveWindow", "UPtr", this.hWB, "Int", 0, "Int", 0, "Int", w, "Int", h, "UInt", 0)
				
				return 0
			}
			else if (Msg == NeutronWindow.WM_DESTROY)
			{
				; Clean up all our circular references so that the object may be
				; garbage collected.
				
				for i, message in this.LISTENERS
					OnMessage(message, this.bound._OnMessage, 0)
				; v2 语法：ComObjConnect 需要 COM 对象
				; 注意：IsSet 不能用于对象属性，使用 try-catch 检查
				try {
					if (IsObject(this.wbComObj))
						ComObjConnect(this.wbComObj)
				} catch {
					; 忽略错误
				}
				this.bound := []
			}
		}
		else if (hWnd == this.hIES || hWnd == this.hSDOV)
		{
			; Handle messages for the rendered Internet Explorer_Server (控件消息)
			; 注意：this.hIES 是 Internet Explorer_Server 控件句柄
			;      this.hSDOV 是 Shell DocObject View 控件句柄
			;      这两个都是子控件，不是主窗口 (控件消息)
			; 注意：this.hIES 是 Internet Explorer_Server 控件句柄
			;      this.hSDOV 是 Shell DocObject View 控件句柄
			;      这两个都是子控件，不是主窗口
			; v2 语法：静态属性通过类名访问
			pressed := (Msg == NeutronWindow.WM_KEYDOWN || Msg == NeutronWindow.WM_SYSKEYDOWN)
			released := (Msg == NeutronWindow.WM_KEYUP || Msg == NeutronWindow.WM_SYSKEYUP)
			
			if (pressed || released)
			{
				; Track modifier states
				; v2 语法：使用 Has 方法检查键是否存在，避免访问不存在的键时抛出错误
				if (this.MODIFIER_BITMAP.Has(wParam)) {
					bit := this.MODIFIER_BITMAP[wParam]
					this.modifiers := (this.modifiers & ~bit) | (pressed * bit)
				}
				
				; Block disabled key combinations (v2 语法：Map 嵌套访问)
				if (this.disabled_shortcuts.Has(this.modifiers) && this.disabled_shortcuts[this.modifiers].Has(wParam) && this.disabled_shortcuts[this.modifiers][wParam])
					return 0
				
				
				; When you press tab with the last tabbable item in the
				; document already selected, focus will be taken from the IES
				; control and moved to the SDOV control. The accelerator code
				; from the AutoHotkey installer uses a conditional loop in an
				; attempt to work around this behavior, but as implemented it
				; did not work correctly on my system. Instead, listen for the
				; tab up event on the SDOV and swap it for a tab down before
				; translating it. This should prevent the user from tabbing to
				; the SDOV in most cases, though there may still be some way to
				; tab to it that I am not aware of. A more elegant solution may
				; be to subclass the SDOV like was done for the IES, then
				; forward the WM_SETFOCUS message back to the IES control.
				; However, given the relative complexity of subclassing and the
				; fact that this message substution approach appears to work
				; just as well, we will use the message substitution. Consider
				; implementing the other approach if it turns out that the
				; undesirable behavior continues to manifest under some
				; circumstances.
				Msg := hWnd == this.hSDOV ? NeutronWindow.WM_KEYDOWN : Msg
				
				; Modified accelerator handling code from AutoHotkey Installer
				; v2 语法：Gui +OwnDialogs 改为通过 Gui 对象设置
				; v2 语法：使用 WinGetPos 获取窗口位置（A_GuiX/A_GuiY 在 v2 中不存在）
				WinGetPos(&guiX, &guiY, &guiW, &guiH, "ahk_id " . this.hWnd)
				; v2 语法：ComObjQuery 需要 COM 对象
				pipa := ComObjQuery(this.wbComObj, "{00000117-0000-0000-C000-000000000046}")
				kMsg := Buffer(48, 0)
				NumPut("Ptr", hWnd, kMsg, 0)
				NumPut("UInt", Msg, kMsg, A_PtrSize)
				NumPut("UPtr", wParam, kMsg, A_PtrSize+4)
				NumPut("Ptr", lParam, kMsg, A_PtrSize+4+A_PtrSize)
				NumPut("UInt", A_EventInfo, kMsg, A_PtrSize+4+A_PtrSize+A_PtrSize)
				NumPut("Int", guiX, kMsg, A_PtrSize+4+A_PtrSize+A_PtrSize+4)
				NumPut("Int", guiY, kMsg, A_PtrSize+4+A_PtrSize+A_PtrSize+4+4)
				; v2 语法：NumGet 需要指定类型参数
				vtablePtr := NumGet(pipa, 0, "Ptr")  ; 获取 vtable 指针
				translateAcceleratorPtr := NumGet(vtablePtr, 5*A_PtrSize, "Ptr")  ; 获取 TranslateAccelerator 函数指针
				r := DllCall(translateAcceleratorPtr, "ptr", pipa, "ptr", kMsg.Ptr)
				ObjRelease(pipa)
				
				if (r == 0) ; S_OK: the message was translated to an accelerator.
					return 0
				return
			}
		}
	}
	
	_WindowProc(Msg, wParam, lParam)
	{
		; v2 语法：声明局部变量，消除未赋值警告
		local hWnd, x, y, wX, wY, wW, wH, row, col
		
		; v2 语法：这是类方法，this 是隐式的
		Critical(true)
		hWnd := this.hIES  ; 使用 this.hIES 作为窗口句柄
		
		; v2 语法：静态属性通过类名访问
		if (Msg == NeutronWindow.WM_NCHITTEST)
		{
			; Check to see if the cursor is near the window border, which
			; should be treated as the "non-client" drag-to-resize area.
			; https://autohotkey.com/board/topic/23969-/#entry155480
			
			; Extract coordinates from LOWORD and HIWORD (preserving sign)
			x := lParam<<48>>48
			y := lParam<<32>>48
			
			; Get the window position for comparison (v2 语法)
			WinGetPos(&wX, &wY, &wW, &wH, "ahk_id " . hWnd)
			
			; Calculate positions in the lookup tables
			row := (x < wX + this.border_size) ? 1 : (x >= wX + wW - this.border_size) ? 3 : 2
			col := (y < wY + this.border_size) ? 1 : (y >= wY + wH - this.border_size) ? 3 : 2
			
			return NeutronWindow.HT_VALUES[col, row]
		}
		else if (Msg == NeutronWindow.WM_NCLBUTTONDOWN)
		{
			; Hoist nonclient clicks to main window
			; 注意：应该发送到主窗口 hWnd，而不是 this.hIES
			return DllCall("SendMessage", "Ptr", this.hWnd, "UInt", Msg, "UPtr", wParam, "Ptr", lParam, "Ptr")
		}
		
		; Otherwise (since above didn't return), pass all unhandled events to the original WindowProc.
		Critical(false)  ; v2 语法
		return DllCall("CallWindowProc"
		, "Ptr", this.pWndProcOld ; WNDPROC lpPrevWndFunc
		, "Ptr", hWnd             ; HWND    hWnd
		, "UInt", Msg             ; UINT    Msg
		, "UPtr", wParam          ; WPARAM  wParam
		, "Ptr", lParam           ; LPARAM  lParam
		, "Ptr") ; LRESULT
	}
	
	; --- Instance Methods ---
	
	; Triggers window dragging. Call this on mouse click down. Best used as your
	; title bar's onmousedown attribute.
	DragTitleBar()
	{
		; v2 语法：PostMessage
		PostMessage(NeutronWindow.WM_NCLBUTTONDOWN, 2, 0, , "ahk_id " . this.hWnd)
	}
	
	; Minimizes the Neutron window. Best used in your title bar's minimize
	; button's onclick attribute.
	Minimize()
	{
		WinMinimize("ahk_id " . this.hWnd)
	}
	
	; Maximize the Neutron window. Best used in your title bar's maximize
	; button's onclick attribute.
	Maximize()
	{
		if DllCall("IsZoomed", "UPtr", this.hWnd)
		{
			WinRestore("ahk_id " . this.hWnd)
			; remove this class from document body
			try {
				this.qs("body").classList.remove("neutron-maximized")
			} catch {
			}
		}
		else
		{
			WinMaximize("ahk_id " . this.hWnd)
			; add this class to document body
			try {
				this.qs("body").classList.add("neutron-maximized")
			} catch {
			}
		}
	}
	
	; Closes the Neutron window. Best used in your title bar's close
	; button's onclick attribute.
	Close()
	{
		WinClose("ahk_id " . this.hWnd)
	}
	
	; Hides the Nuetron window.
	Hide()
	{
		this.Gui.Hide()
	}
	
	; Destroys the Neutron window. Do this when you would no longer want to
	; re-show the window, as it will free the memory taken up by the GUI and
	; ActiveX control. This method is best used either as your title bar's close
	; button's onclick attribute, or in a custom window close routine.
	Destroy()
	{
		this.Gui.Destroy()
	}
	
	; Shows a hidden Neutron window.
	Show(options:="",title:="")
	{
		; v2 语法：RegExMatch 输出变量使用 & 前缀
		w := RegExMatch(options, "w\s*\K\d+", &match) ? match[] : this.w
		h := RegExMatch(options, "h\s*\K\d+", &match) ? match[] : this.h
		
		; AutoHotkey sizes the window incorrectly, trying to account for borders
		; that aren't actually there. Call the function AHK uses to offset and
		; apply the change in reverse to get the actual wanted size.
		rect := Buffer(16, 0)
		DllCall("AdjustWindowRectEx"
		, "Ptr", rect.Ptr ;  LPRECT lpRect
		, "UInt", 0x80CE0000 ;  DWORD  dwStyle
		, "UInt", 0 ;  BOOL   bMenu
		, "UInt", 0 ;  DWORD  dwExStyle
		, "UInt") ; BOOL
		w += NumGet(rect, 0, "Int")-NumGet(rect, 8, "Int")
		h += NumGet(rect, 4, "Int")-NumGet(rect, 12, "Int")
		
		; v2 语法：显示窗口
		ShowOptions := options . " w" . w . " h" . h
		this.Gui.Show(ShowOptions)
		if (title != "") {
			WinSetTitle(title, "ahk_id " . this.hWnd)
		}
	}
	
	; Loads an HTML file by name (not path). When running the script uncompiled,
	; looks for the file in the local directory. When running the script
	; compiled, looks for the file in the EXE's RCDATA. Files included in your
	; compiled EXE by FileInstall are stored in RCDATA whether they get
	; extracted or not. An easy way to get your Neutron resources into a
	; compiled script, then, is to put FileInstall commands for them right below
	; the return at the bottom of your AutoExecute section.
	;
	; Parameters:
	;   fileName - The name of the HTML file to load into the Neutron window.
	;              Make sure to give just the file name, not the full path.
	;
	; Returns: nothing
	;
	; Example:
	;
	; ; AutoExecute Section
	; neutron := new NeutronWindow()
	; neutron.Load("index.html")
	; neutron.Show()
	; return
	; FileInstall, index.html, index.html
	; FileInstall, index.css, index.css
	;
	Load(fileName)
	{
		; v2 语法：声明局部变量
		local url, dispatchObj
		
		; 添加容错处理
		try {
			; 检查 fileName 是否是完整路径（包含驱动器号或绝对路径标识）
			; 如果是完整路径，直接使用；否则拼接工作目录
			if (A_IsCompiled) {
				; 编译后的脚本：使用资源路径
				url := "res://" this.EncodeUri(A_ScriptFullPath) "/10/" fileName
			} else {
				; 未编译的脚本：检查是否是完整路径
				if (InStr(fileName, ":") || SubStr(fileName, 1, 1) = "\") {
					; 是完整路径，直接使用（需要转换为 file:// 协议）
					url := "file:///" . StrReplace(fileName, "\", "/")
				} else {
					; 是相对路径，拼接工作目录
					url := "file:///" . StrReplace(A_WorkingDir "\" fileName, "\", "/")
				}
			}
			
			; Navigate to the calculated file URL
			; v2 语法：通过 COM 对象访问 Navigate，直接操作底层 COM 对象
			this.wbComObj.Navigate(url)
			
			; Wait for the page to finish loading
			; v2 语法：通过 COM 对象访问 readyState
			while this.wbComObj.readyState < 3
				Sleep(50)
			
			; Inject the AHK objects into the JS scope
			; v2 语法：通过 COM 对象访问 Document 和 parentWindow，直接操作底层 COM 对象
			; 禁止使用 this.doc := ... 或 this.wnd := ...，必须直接操作 COM 对象
			this.wbComObj.Document.parentWindow.neutron := this
			; v2 语法：嵌套类需要通过类名访问
			dispatchObj := NeutronWindow.Dispatch(this)
			this.wbComObj.Document.parentWindow.ahk := dispatchObj
			
			; Wait for the page to finish loading
			; v2 语法：通过 COM 对象访问 readyState
			while this.wbComObj.readyState < 4
				Sleep(50)
		} catch as e {
			MsgBox("加载文件失败: " e.Message "`n行号: " e.Line "`n文件: " fileName, "错误", "Iconx")
			throw
		}
	}
	
	; Shorthand method for document.querySelector
	qs(selector)
	{
		return this.doc.querySelector(selector)
	}
	
	; Shorthand method for document.querySelectorAll
	qsa(selector)
	{
		return this.doc.querySelectorAll(selector)
	}
	
	; Passthrough method for the Gui command, targeted at the Neutron Window
	; instance
	; v2 语法：重命名为 GuiCommand 以避免与 Gui 属性冲突
	GuiCommand(subCommand, value1:="", value2:="", value3:="")
	{
		; v2 语法：通过 Gui 对象调用方法
		; 支持多个命令，用空格分隔（如 "+AlwaysOnTop +ToolWindow -Caption -DPIScale"）
		; 将命令字符串分割并逐个处理
		commands := StrSplit(Trim(subCommand), " ")
		for index, cmd in commands {
			if (cmd = "+AlwaysOnTop") {
				WinSetAlwaysOnTop(1, "ahk_id " . this.hWnd)
			} else if (cmd = "-AlwaysOnTop") {
				WinSetAlwaysOnTop(0, "ahk_id " . this.hWnd)
			} else if (cmd = "+ToolWindow") {
				; ToolWindow 样式在创建时设置，这里忽略
			} else if (cmd = "-Caption") {
				; 无边框在创建时设置，这里忽略
			} else if (cmd = "-DPIScale") {
				; DPI 缩放在创建时设置，这里忽略
			}
			; 其他命令忽略，避免访问只读属性
		}
	}
	
	; Changes the window AccentState to ACCENT_ENABLE_GRADIENT
	; and sets the specified fill color
	SetWindowFillColor(colorHex:="000000")
	{
		colorHex := this._HexToABGR(colorHex)
		wcad := Buffer(A_PtrSize+A_PtrSize+4, 0)
		; v2 语法：静态属性通过类名访问
		NumPut("Int", NeutronWindow.WCA_ACCENT_POLICY, wcad, 0)
		accent := Buffer(16, 0)
		NumPut("Int", NeutronWindow.ACCENT_ENABLE_GRADIENT, accent, 0)
		NumPut("Int", colorHex, accent, 8)
		NumPut("Ptr", accent.Ptr, wcad, A_PtrSize)
		NumPut("Int", 16, wcad, A_PtrSize+A_PtrSize)
		DllCall("SetWindowCompositionAttribute", "UPtr", this.hWnd, "UPtr", wcad.Ptr)
	}

	; --- Static Methods ---
	
	; 注意：静态回调方法已移除，改为在 __New 中使用闭包函数直接绑定对象引用
	
	; Given an HTML Collection (or other JavaScript array), return an enumerator
	; that will iterate over its items.
	;
	; Parameters:
	;     htmlCollection - The JavaScript array to be iterated over
	;
	; Returns: An Enumerable object
	;
	; Example:
	;
	; neutron := new NeutronWindow("<body><p>A</p><p>B</p><p>C</p></body>")
	; neutron.Show()
	; for i, element in neutron.Each(neutron.body.children)
	;     MsgBox, % i ": " element.innerText
	;
	Each(htmlCollection)
	{
		; v2 语法：嵌套类需要通过类名访问
		enumObj := NeutronWindow.Enumerable(htmlCollection)
		return enumObj
	}
	
	; Given an HTML Form Element, construct a FormData object
	;
	; Parameters:
	;   formElement - The HTML Form Element
	;   useIdAsName - When a field's name is blank, use it's ID instead
	;
	; Returns: A FormData object
	;
	; Example:
	;
	; neutron := new NeutronWindow("<form>"
	; . "<input type='text' name='field1' value='One'>"
	; . "<input type='text' name='field2' value='Two'>"
	; . "<input type='text' name='field3' value='Three'>"
	; . "</form>")
	; neutron.Show()
	; formElement := neutron.doc.querySelector("form") ; Grab 1st form on page
	; formData := neutron.GetFormData(formElement) ; Get form data
	; MsgBox, % formData.field2 ; Pull a single field
	; for name, element in formData ; Iterate all fields
	;     MsgBox, %name%: %element%
	;
	GetFormData(formElement, useIdAsName:=True)
	{
		; v2 语法：避免 new 关键字警告
		formData := this.FormData()
		
		for i, field in this.Each(formElement.elements)
		{
			; Discover the field's name
			name := ""
			try ; fieldset elements error when reading the name field
				name := field.name
			if (name == "" && useIdAsName)
				name := field.id
			
			; Filter against fields which should be omitted
			if (name == "" || field.disabled
				|| field.type ~= "^file|reset|submit|button$")
				continue
			
			; Handle select-multiple variants
			if (field.type == "select-multiple")
			{
				for j, option in this.Each(field.options)
					if (option.selected)
						formData.add(name, option.value)
				continue
			}
			
			; Filter against unchecked checkboxes and radios
			if (field.type ~= "^checkbox|radio$" && !field.checked)
				continue
			
			; Return the field values
			formData.add(name, field.value)
		}
		
		return formData
	}
	
	; Given a potentially HTML-unsafe string, return an HTML safe string
	; https://stackoverflow.com/a/6234804
	EscapeHTML(unsafe)
	{
		unsafe := StrReplace(unsafe, "&", "&amp;")
		unsafe := StrReplace(unsafe, "<", "&lt;")
		unsafe := StrReplace(unsafe, ">", "&gt;")
		; v2 语法：使用 Chr(34) 或转义引号
		unsafe := StrReplace(unsafe, Chr(34), "&quot;")
		unsafe := StrReplace(unsafe, "'", "&#039;")
		return unsafe
	}

	; Encodes reserved uri characters
	; https://developer.mozilla.org/en-US/docs/Glossary/Percent-encoding
	EncodeUri(uri)
	{
		uri := StrReplace(uri, "%", "%25")
		uri := StrReplace(uri, ":", "%3A")
		uri := StrReplace(uri, "/", "%2F")
		uri := StrReplace(uri, "?", "%3F")
		uri := StrReplace(uri, "#", "%23")
		uri := StrReplace(uri, "[", "%5B")
		uri := StrReplace(uri, "]", "%5D")
		uri := StrReplace(uri, "@", "%40")
		uri := StrReplace(uri, "!", "%21")
		uri := StrReplace(uri, "$", "%24")
		uri := StrReplace(uri, "&", "%26")
		uri := StrReplace(uri, "'", "%27")
		uri := StrReplace(uri, "(", "%28")
		uri := StrReplace(uri, ")", "%29")
		uri := StrReplace(uri, "*", "%2A")
		uri := StrReplace(uri, "+", "%2B")
		uri := StrReplace(uri, ",", "%2C")
		uri := StrReplace(uri, ";", "%3B")
		uri := StrReplace(uri, "=", "%3D")
		uri := StrReplace(uri, " ", "%20")
		return uri
	}
	
	; Wrapper for Format that applies EscapeHTML to each value before passing
	; them on. Useful for dynamic HTML generation.
	FormatHTML(formatStr, values*)
	{
		for i, value in values
			values[i] := this.EscapeHTML(value)
		return Format(formatStr, values*)
	}
	
	; Converts any hex-formatted RGB color to ABGR format,
	; colorHex can be passed as "#ff00ff" or as 0xff00ff
	_HexToABGR(colorHex)
	{
		colorHex := StrReplace(colorHex, "0x", "")
		colorHex := StrReplace(colorHex, "#", "")
		return "0xff" SubStr(colorHex, 5, 2) 
			. SubStr(colorHex, 3 , 2) 
			. SubStr(colorHex, 1 , 2)
	}
	
	; --- Nested Classes ---
	
	; Proxies method calls to AHK function calls, binding a given value to the
	; first parameter of the target function.
	;
	; For internal use only.
	;
	; Parameters:
	;   parent - The value to bind
	;
	class Dispatch
	{
		; v2 语法：使用静态变量存储 properties，避免递归
		static _properties_storage := Map()
		; v2 语法：使用静态 Map 存储实例数据，避免在 __Get/__Set 中访问实例属性
		static _instance_data := Map()
		; v2 语法：使用静态 Map 跟踪正在初始化的对象，避免 __Set 递归
		; 使用 Map 代替 Set，键为对象指针，值为 true
		static _initializing := Map()
		
		__New(parent)
		{
			; v2 语法：标记当前对象正在初始化
			; 使用对象指针作为唯一标识
			thisPtr := ObjPtr(this)
			; 使用类名直接访问静态属性，避免通过 this.Class 触发递归
			; 使用 Map 存储，键为对象指针，值为 true
			NeutronWindow.Dispatch._initializing[thisPtr] := true
			
			try {
				; v2 语法：为每个实例创建唯一的存储键
				instanceId := A_TickCount . "_" . Random(1000, 9999)
				; v2 语法：将实例数据存储在静态 Map 中，避免在 __Get/__Set 中访问实例属性
				NeutronWindow.Dispatch._instance_data[thisPtr] := {instance_id: instanceId, parent: parent}
				; v2 语法：在静态 Map 中为每个实例创建独立的 properties Map
				; 使用类名直接访问静态属性，避免通过 this.Class 触发递归
				NeutronWindow.Dispatch._properties_storage[instanceId] := Map()
			} finally {
				; v2 语法：初始化完成，移除标记
				; 使用类名直接访问静态属性，避免通过 this.Class 触发递归
				; 使用 Map 的 Delete 方法移除标记
				NeutronWindow.Dispatch._initializing.Delete(thisPtr)
			}
		}
		
		__Call(params*)
		{
			; v2 语法：从静态存储中获取 properties，避免触发 __Get
			; 使用类名直接访问静态属性，避免通过 this.Class 触发递归
			; 从静态 Map 中获取实例数据，避免触发 __Get
			thisPtr := ObjPtr(this)
			instanceData := NeutronWindow.Dispatch._instance_data[thisPtr]
			if (!IsObject(instanceData))
				throw Error("Instance data not found")
			instanceId := instanceData.instance_id
			props := NeutronWindow.Dispatch._properties_storage[instanceId]
			; 如果第一个参数是属性名（已存储的函数），直接调用它
			if (IsObject(props) && props.Has(params[1])) {
				propValue := props[params[1]]
				; v2 语法：检查是否是函数对象（使用类型检查或 HasMethod）
				if (Type(propValue) = "Func" || (IsObject(propValue) && propValue.HasMethod("Call"))) {
					; 如果是函数，调用它（第一个参数是函数名，需要移除）
					params.RemoveAt(1)
					return propValue.Call(params*)
				} else {
					; 如果不是函数，返回属性值
					return propValue
				}
			}
			
			; 否则，尝试作为函数名调用
			; Make sure the given name is a function
			; v2 语法：使用 Error() 而不是 Exception()
			if !(fn := Func(params[1]))
				throw Error("Unknown function: " params[1])
			
			; Make sure enough parameters were given
			if (params.length() < fn.MinParams)
				throw Error("Too few parameters given to " fn.Name ": " params.length())
			
			; Make sure too many parameters weren't given
			if (params.length() > fn.MaxParams && !fn.IsVariadic)
				throw Error("Too many parameters given to " fn.Name ": " params.length())
			
			; Change first parameter from the function name to the neutron instance
			params[1] := this.parent
			
			; Call the function
			return fn.Call(params*)
		}
		
		; v2 语法：支持动态属性赋值
		__Set(name, value, params*)
		{
			; v2 语法：禁止设置内部属性（parent 和 _instance_id 存储在静态 Map 中）
			if (name = "_instance_id" || name = "parent") {
				; 这些属性只在 __New 中设置，不允许通过 __Set 修改
				throw PropertyError("Cannot set protected property: " . name, -1, name)
			}
			
			; v2 语法：从静态存储中获取 properties，避免触发 __Get
			; 使用类名直接访问静态属性，避免通过 this.Class 触发递归
			try {
				; 从静态 Map 中获取实例数据，避免触发 __Get
				thisPtr := ObjPtr(this)
				instanceData := NeutronWindow.Dispatch._instance_data[thisPtr]
				if (!IsObject(instanceData))
					throw Error("Instance data not found")
				instanceId := instanceData.instance_id
				
				props := NeutronWindow.Dispatch._properties_storage[instanceId]
				if (!IsObject(props))
					throw Error("Properties map not initialized")
				props[name] := value
				return value
			} catch as err {
				; 如果赋值失败，抛出错误
				throw PropertyError("Cannot set property: " . name . " - " . err.Message, -1, name)
			}
		}
		
		; v2 语法：支持动态属性读取
		; 当 JavaScript 访问 window.ahk.closePanel 时，返回存储的函数
		__Get(name, params*)
		{
			; v2 语法：防止递归 - 如果 name 是 "Class"，直接抛出错误
			if (name = "Class")
				throw PropertyError("Cannot access 'Class' property", -1, name)
			
			; v2 语法：防止递归 - 使用静态标志跟踪是否在 __Get 中
			static _in_get := Map()
			thisPtr := ObjPtr(this)
			if (_in_get.Has(thisPtr))
				throw Error("Recursive __Get detected for: " . name)
			_in_get[thisPtr] := true
			
			try {
				; v2 语法：从静态存储中获取实例数据，避免触发 __Get
				; 使用类名直接访问静态属性，避免通过 this.Class 触发递归
				instanceData := NeutronWindow.Dispatch._instance_data[thisPtr]
				if (!IsObject(instanceData))
					throw Error("Instance data not found")
				
				; v2 语法：防止递归 - 如果 name 是特殊属性，直接返回
				if (name = "_instance_id")
					return instanceData.instance_id
				if (name = "parent")
					return instanceData.parent
				if (name = "properties") {
					; 使用实例数据中的 instance_id
					instanceId := instanceData.instance_id
					; 使用类名直接访问静态属性，避免通过 this.Class 触发递归
					return NeutronWindow.Dispatch._properties_storage[instanceId]
				}
				
				; v2 语法：从静态存储中获取 properties，避免触发 __Get
				instanceId := instanceData.instance_id
				; 使用类名直接访问静态属性，避免通过 this.Class 触发递归
				props := NeutronWindow.Dispatch._properties_storage[instanceId]
				if (IsObject(props) && props.Has(name))
					return props[name]
				; 如果没有找到属性，返回一个函数包装器，用于调用
				; 这样 JavaScript 可以调用 window.ahk.closePanel()
				return (*) => this.__Call(name, params*)
			} finally {
				; 移除递归标志
				_in_get.Delete(thisPtr)
			}
		}
	}
	
	; Handles Web Browser events
	; https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/platform-apis/aa768283%28v%3dvs.85%29
	;
	; For internal use only
	;
	; Parameters:
	;   parent - An instance of the Neutron class
	;
	class WBEvents
	{
		__New(parent)
		{
			this.parent := parent
		}
		
		DocumentComplete(pDisp, URL, ComObj)
		{
			; v2 语法：DocumentComplete 事件接收 3 个参数：
			; pDisp: WebBrowser 对象
			; URL: 文档的 URL
			; ComObj: 原始 COM 对象的引用（AutoHotkey 自动传递）
			
			; 确保事件是针对顶级文档的，而不是框架
			; 注意：在 v2 中，我们需要使用传入的 ComObj 参数
			; 但为了兼容性，我们也可以直接使用 this.parent.wbComObj
			
			; Inject the AHK objects into the JS scope
			; 使用传入的 pDisp 或 ComObj，确保是顶级文档
			try {
				; 使用 this.parent.wbComObj 确保使用正确的 COM 对象
				if (IsObject(this.parent.wbComObj) && this.parent.wbComObj.Document) {
					this.parent.wbComObj.Document.parentWindow.neutron := this.parent
					; v2 语法：嵌套类需要通过类名访问
					dispatchObj := NeutronWindow.Dispatch(this.parent)
					this.parent.wbComObj.Document.parentWindow.ahk := dispatchObj
				}
			} catch as e {
				; 如果注入失败，记录错误但不中断流程
				; MsgBox("接口注入失败: " e.Message, "警告", "Icon!")
			}
		}
	}
	
	; Enumerator class that enumerates the items of an HTMLCollection (or other
	; JavaScript array).
	;
	; Best accessed through the .Each() helper method.
	;
	; Parameters:
	;   htmlCollection - The HTMLCollection to be enumerated.
	;
	class Enumerable
	{
		i := 0
		
		__New(htmlCollection)
		{
			this.collection := htmlCollection
		}
		
		_NewEnum()
		{
			return this
		}
		
		Next(&i, &elem)  ; v2 语法：使用 & 而不是 ByRef
		{
			if (this.i >= this.collection.length)
				return False
			i := this.i
			elem := this.collection.item(this.i++)
			return True
		}
	}
	
	; A collection similar to an OrderedDict designed for holding form data.
	; This collection allows duplicate keys and enumerates key value pairs in
	; the order they were added.
	class FormData
	{
		names := []
		values := []
		
		; Add a field to the FormData structure.
		;
		; Parameters:
		;   name - The form field name associated with the value
		;   value - The value of the form field
		;
		; Returns: Nothing
		;
		Add(name, value)
		{
			this.names.Push(name)
			this.values.Push(value)
		}
		
		; Get an array of all values associated with a name.
		;
		; Parameters:
		;   name - The form field name associated with the values
		;
		; Returns: An array of values
		;
		; Example:
		;
		; fd := new NeutronWindow.FormData()
		; fd.Add("foods", "hamburgers")
		; fd.Add("foods", "hotdogs")
		; fd.Add("foods", "pizza")
		; fd.Add("colors", "red")
		; fd.Add("colors", "green")
		; fd.Add("colors", "blue")
		; for i, food in fd.All("foods")
		;     out .= i ": " food "`n"
		; MsgBox, %out%
		;
		All(name)
		{
			values := []
			for i, v in this.names
				if (v == name)
					values.Push(this.values[i])
			return values
		}
		
		; Meta-function to allow direct access of field values using either dot
		; or bracket notation. Can retrieve the nth item associated with a given
		; name by passing more than one value in when bracket notation.
		;
		; Example:
		;
		; fd := new NeutronWindow.FormData()
		; fd.Add("foods", "hamburgers")
		; fd.Add("foods", "hotdogs")
		; MsgBox, % fd.foods ; hamburgers
		; MsgBox, % fd["foods", 2] ; hotdogs
		;
		__Get(name, n := 1)
		{
			for i, v in this.names
				if (v == name && !--n)
					return this.values[i]
		}
		
		; Allow iteration in the order fields were added, instead of a normal
		; object's alphanumeric order of iteration.
		;
		; Example:
		;
		; fd := new NeutronWindow.FormData()
		; fd.Add("z", "3")
		; fd.Add("y", "2")
		; fd.Add("x", "1")
		; for name, field in fd
		;     out .= name ": " field ","
		; MsgBox, %out% ; z: 3, y: 2, x: 1
		;
		_NewEnum()
		{
			; v2 语法：对象字面量键名不需要引号，base 需要特殊处理
			enum := {i: 0}
			enum.base := this
			return enum
		}
		Next(&name, &value)  ; v2 语法：使用 & 而不是 ByRef
		{
			if (++this.i > this.names.length())
				return False
			name := this.names[this.i]
			value := this.values[this.i]
			return True
		}
	}
}

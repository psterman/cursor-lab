#Requires AutoHotkey v2.0

; 自动检测路径：优先尝试当前目录下的 images 文件夹，如果没有，则使用当前目录本身
if DirExist(A_ScriptDir "\images")
    ImageFolder := A_ScriptDir "\images"
else
    ImageFolder := A_ScriptDir

OutputFile := A_ScriptDir "\icons_data.ahk"

ResultText := "; --- 请将以下代码复制到主脚本 (curser.ahk) 的开头 ---`n`n"
ResultText .= "global Icons := Map()`n"
count := 0

Loop Files, ImageFolder "\*.*" {
    ; 过滤图片格式
    if !RegExMatch(A_LoopFileExt, "i)^(png|jpg|jpeg|gif|svg|ico)$")
        continue
    
    try {
        fileBuf := FileRead(A_LoopFileFullPath, "RAW")
        base64String := BinToBase64(fileBuf)
        
        ; 确定 MIME 类型
        ext := LowCase(A_LoopFileExt)
        mime := (ext = "svg") ? "image/svg+xml" : (ext = "ico" ? "image/x-icon" : "image/" ext)
        
        ; 写入 Map
        ResultText .= 'Icons["' A_LoopFileName '"] := "data:' mime ';base64,' base64String '"`n'
        count++
    }
}

if (count = 0) {
    MsgBox "在路径: " ImageFolder " 下没有找到任何图片文件！"
    return
}

if FileExist(OutputFile)
    FileDelete(OutputFile)

FileAppend(ResultText, OutputFile, "UTF-8")
Run(OutputFile) 
MsgBox "转换成功！共处理 " count " 个图标。`n结果已保存在: icons_data.ahk"

; --- V2 兼容转换函数 ---
BinToBase64(buf) {
    static CRYPT_STRING_BASE64 := 0x00000001
    static CRYPT_STRING_NOCRLF := 0x40000000
    if !DllCall("crypt32\CryptBinaryToString", "Ptr", buf.Ptr, "UInt", buf.Size, "UInt", CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, "Ptr", 0, "UInt*", &outLen := 0)
        return ""
    VarSetStrCapacity(&str, outLen)
    DllCall("crypt32\CryptBinaryToString", "Ptr", buf.Ptr, "UInt", buf.Size, "UInt", CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, "Str", str, "UInt*", &outLen)
    return str
}

LowCase(str) => StrLower(str)
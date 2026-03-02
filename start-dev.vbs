Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d ""C:\Users\pster\Desktop\backup"" && npm run dev", 0, False
Set WshShell = Nothing

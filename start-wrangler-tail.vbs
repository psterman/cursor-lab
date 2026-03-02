Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d ""C:\Users\pster\Desktop\backup"" && npx wrangler tail", 0, False
Set WshShell = Nothing

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = scriptDir
' 0 = hidden console; false = don't wait
sh.Run "cmd /c """ & scriptDir & "\start-opencode-desktop.bat""", 0, False

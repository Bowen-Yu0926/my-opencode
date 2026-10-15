Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "E:\myopencode"
' 0 = hidden console; false = don't wait
sh.Run "cmd /c ""E:\myopencode\start-opencode-desktop.bat""", 0, False

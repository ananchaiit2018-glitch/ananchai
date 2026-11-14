' Run the register in the background without a black window
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
sh.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "cmd /c if not exist data mkdir data & node --disable-warning=ExperimentalWarning server\index.js --open > data\server.log 2>&1", 0, False

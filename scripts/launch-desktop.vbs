Option Explicit

Dim fso
Dim shell
Dim scriptDir
Dim repoRoot
Dim distPath
Dim logDir
Dim logPath
Dim logFile
Dim command
Dim timestamp

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
repoRoot = fso.GetParentFolderName(scriptDir)
shell.CurrentDirectory = repoRoot

distPath = fso.BuildPath(repoRoot, "dist\desktop\launch.js")

If Not fso.FileExists(distPath) Then
  MsgBox "signal-fire not built. Run 'pnpm build' in the project directory first.", vbExclamation, "signal-fire"
  WScript.Quit 1
End If

logDir = fso.BuildPath(shell.ExpandEnvironmentStrings("%USERPROFILE%"), ".signal-fire")
If Not fso.FolderExists(logDir) Then
  fso.CreateFolder logDir
End If
logPath = fso.BuildPath(logDir, "launch.log")

timestamp = Now()

Set logFile = fso.OpenTextFile(logPath, 8, True)
logFile.WriteLine "[" & timestamp & "] launching dist\desktop\launch.js"
logFile.Close

command = "cmd /c node ""dist\desktop\launch.js"" >> """ & logPath & """ 2>&1"
shell.Run command, 0, False

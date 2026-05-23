Option Explicit

Dim fso
Dim shell
Dim scriptDir
Dim repoRoot
Dim distPath
Dim logDir
Dim logPath
Dim runLogPath
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
runLogPath = fso.BuildPath(logDir, "launch-" & TimestampSlug() & ".log")

timestamp = Now()

SafeAppendLine logPath, "[" & timestamp & "] launching dist\desktop\launch.js; output=" & runLogPath

command = "cmd /c node ""dist\desktop\launch.js"" >> """ & runLogPath & """ 2>&1"
shell.Run command, 0, False

Function TwoDigits(value)
  TwoDigits = Right("0" & CStr(value), 2)
End Function

Function TimestampSlug()
  Dim nowValue
  nowValue = Now()
  Randomize
  TimestampSlug = _
    Year(nowValue) & "-" & _
    TwoDigits(Month(nowValue)) & "-" & _
    TwoDigits(Day(nowValue)) & "T" & _
    TwoDigits(Hour(nowValue)) & "-" & _
    TwoDigits(Minute(nowValue)) & "-" & _
    TwoDigits(Second(nowValue)) & "-" & _
    CStr(Int(Rnd() * 1000000))
End Function

Sub SafeAppendLine(filePath, line)
  On Error Resume Next
  Set logFile = fso.OpenTextFile(filePath, 8, True)
  If Err.Number <> 0 Then
    Err.Clear
    On Error Goto 0
    Exit Sub
  End If
  logFile.WriteLine line
  logFile.Close
  On Error Goto 0
End Sub

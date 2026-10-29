; After a silent in-app update (/S /UPDATE) start the app again. The updater in older versions
; does not pass /R, so the installer itself takes care of the restart.
; Versions before the rename to Astra Isle installed as "Dynamic Island" (own folder + uninstall entry), so the
; new installer never replaced them and both copies stayed. Silently uninstall the old one; user data lives in
; %APPDATA%\com.dynamicisland.app, which the uninstaller keeps.
!macro NSIS_HOOK_PREINSTALL
  Push $0
  Push $1
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dynamic Island" "UninstallString"
  ${If} $0 != ""
    StrCpy $1 "$LOCALAPPDATA\Dynamic Island"
    ; _?= keeps the uninstaller from copying itself away, so ExecWait really waits for it to finish.
    ExecWait '$0 /S _?=$1'
    Delete "$1\uninstall.exe"
    RMDir "$1"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dynamic Island"
    Delete "$SMPROGRAMS\Dynamic Island.lnk"
    Delete "$DESKTOP\Dynamic Island.lnk"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Dynamic Island"
  ${EndIf}
  Pop $1
  Pop $0
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; A silent update skips the shortcut step, so an install that lost its Start menu entry (for example after
  ; the rename to Astra Isle) never gets it back and Windows Search can't find the app. Put it back if missing.
  ${If} $UpdateMode = 1
    ${IfNot} ${FileExists} "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    ${EndIf}
  ${EndIf}
  ${If} $UpdateMode = 1
    nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
  ${EndIf}
!macroend

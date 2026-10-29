; After a silent in-app update (/S /UPDATE) start the app again. The updater in older versions
; does not pass /R, so the installer itself takes care of the restart.
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

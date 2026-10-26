; After a silent in-app update (/S /UPDATE) start the app again. The updater in older versions
; does not pass /R, so the installer itself takes care of the restart.
!macro NSIS_HOOK_POSTINSTALL
  ${If} $UpdateMode = 1
    nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
  ${EndIf}
!macroend

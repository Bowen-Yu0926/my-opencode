; OpenCode NSIS helpers.
;
; Default electron-builder Finish+Run uses StdUtils.ExecShellAsUser synchronously.
; On some Windows setups that call blocks long enough for the wizard to show
; "Not Responding" while OpenCode cold-starts (or Defender scans the new exe).
; Launch via `cmd /c start` so the installer can close immediately.

!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ; /D sets cwd; empty window title is required so quoted paths parse correctly.
    Exec 'cmd.exe /C start "" /D "$INSTDIR" "${APP_EXECUTABLE_FILENAME}" $1'
  FunctionEnd

  Function finishPagePre
    ; Silent/auto-update installs should not leave a Finish dialog that can hang.
    ${if} ${isUpdated}
      HideWindow
      Call StartApp
      Abort
    ${endif}
  FunctionEnd

  !ifndef HIDE_RUN_AFTER_FINISH
    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !endif
  !define MUI_PAGE_CUSTOMFUNCTION_PRE finishPagePre
  !insertmacro MUI_PAGE_FINISH
!macroend

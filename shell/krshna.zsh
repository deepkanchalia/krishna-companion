# Krishna Companion zsh integration

function '/krshna' {
  command krshna "${1:-now}" "${@:2}"
}

function _krshna_prompt_segment {
  local companion_status
  companion_status="$(command krshna prompt 2>/dev/null)"
  [[ -n "$companion_status" ]] && print -n -- "%F{yellow}${companion_status}%f"
}

if [[ "$RPROMPT" != *"_krshna_prompt_segment"* ]]; then
  RPROMPT='$(_krshna_prompt_segment)'${RPROMPT:+"  $RPROMPT"}
  setopt PROMPT_SUBST
fi

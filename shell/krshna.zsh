# Krishna Companion zsh integration

function '/krshna' {
  command krshna "${1:-now}" "${@:2}"
}

function _krshna_prompt_segment {
  local state_dir state_file line live pid paused next_at status
  case "$OSTYPE" in
    darwin*) state_dir="$HOME/Library/Application Support/krishna-companion" ;;
    *) state_dir="${XDG_CONFIG_HOME:-$HOME/.config}/krishna-companion" ;;
  esac
  state_file="$state_dir/state.json"
  [[ -r "$state_file" ]] || return

  # state.json is deliberately small and pretty-printed; avoid starting Node on every prompt.
  while IFS= read -r line; do
    case "$line" in
      *'"live":'*) live="${${line#*: }%,}" ;;
      *'"pid":'*) pid="${${line#*: }%,}" ;;
      *'"paused":'*) paused="${${line#*: }%,}" ;;
      *'"nextReflectionAt":'*) next_at="${${line#*: }%,}" ;;
    esac
  done < "$state_file"

  [[ "$live" == true && "$pid" == <-> ]] || return
  kill -0 "$pid" 2>/dev/null || return
  if [[ "$paused" == true ]]; then
    status="paused"
  elif [[ "$next_at" == <-> ]]; then
    zmodload -F zsh/datetime b:EPOCHSECONDS 2>/dev/null
    local minutes=$(( (next_at - EPOCHSECONDS * 1000 + 59999) / 60000 ))
    (( minutes < 0 )) && minutes=0
    if (( minutes < 1 )); then
      status="<1m"
    else
      status="${minutes}m"
    fi
  else
    status="soon"
  fi
  print -n -- "%F{yellow}🪶 Kṛṣṇa · ${status}%f"
}

if [[ "$RPROMPT" != *"_krshna_prompt_segment"* ]]; then
  RPROMPT='$(_krshna_prompt_segment)'${RPROMPT:+"  $RPROMPT"}
  setopt PROMPT_SUBST
fi

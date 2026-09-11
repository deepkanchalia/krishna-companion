# Krishna Companion zsh integration

function '/krshna' {
  command krshna "${1:-now}" "${@:2}"
}

function _krshna_prompt_segment {
  local state_dir state_file line live pid paused next_at seg
  # The platform rules for this path live in src/paths.js (appDataDirectory), which the
  # CLI uses; a shell cannot import it, so this mirrors them by hand, including the
  # KRSHNA_HOME override the CLI's tests use. Keep the two in step. (Windows has no zsh
  # prompt segment, so only these two cases.)
  local home="${KRSHNA_HOME:-$HOME}"
  case "$OSTYPE" in
    darwin*) state_dir="$home/Library/Application Support/krishna-companion" ;;
    *) state_dir="${XDG_CONFIG_HOME:-$home/.config}/krishna-companion" ;;
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
    seg="paused"
  elif [[ "$next_at" == <-> ]]; then
    zmodload -F zsh/datetime p:EPOCHSECONDS 2>/dev/null
    local minutes=$(( (next_at - EPOCHSECONDS * 1000 + 59999) / 60000 ))
    (( minutes < 0 )) && minutes=0
    if (( minutes < 1 )); then
      seg="<1m"
    else
      seg="${minutes}m"
    fi
  else
    seg="soon"
  fi
  print -n -- "%F{yellow}🪶 Kṛṣṇa · ${seg}%f"
}

if [[ "$RPROMPT" != *"_krshna_prompt_segment"* ]]; then
  RPROMPT='$(_krshna_prompt_segment)'${RPROMPT:+"  $RPROMPT"}
  setopt PROMPT_SUBST
fi

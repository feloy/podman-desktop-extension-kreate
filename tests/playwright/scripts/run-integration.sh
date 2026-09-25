#!/usr/bin/env bash
#
# Copyright (C) 2026 Red Hat, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# SPDX-License-Identifier: Apache-2.0

set -uo pipefail

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PACKAGE_DIR}"

SCREEN_SIZE='1280x960'
SERVER_ARGS="-screen 0 ${SCREEN_SIZE}x24"
VIDEO_DIR="${PACKAGE_DIR}/recordings"
VIDEO_FILE="${VIDEO_DIR}/kreate-e2e.mp4"
RAW_VIDEO_FILE="${VIDEO_DIR}/kreate-e2e.raw.mp4"
SUBTITLES_FILE="${VIDEO_DIR}/kreate-e2e.ass"
CHAPTERS_FILE="${VIDEO_DIR}/kreate-e2e.ffmetadata"
FFMPEG_LOG="${VIDEO_DIR}/kreate-e2e.ffmpeg.log"
VIDEO_SUBTITLES=false
CAPTION_PACE_MS=0
CAPTION_TYPING_DURATION_MS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --subtitles)
      VIDEO_SUBTITLES=true
      shift
      ;;
    --caption-pace-ms)
      if [[ $# -lt 2 ]]; then
        echo '--caption-pace-ms requires a value' >&2
        exit 2
      fi
      CAPTION_PACE_MS="$2"
      shift 2
      ;;
    --typing-duration-ms)
      if [[ $# -lt 2 ]]; then
        echo '--typing-duration-ms requires a value' >&2
        exit 2
      fi
      CAPTION_TYPING_DURATION_MS="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

if [[ "${VIDEO_SUBTITLES}" != true ]]; then
  echo 'The recording script requires --subtitles' >&2
  exit 2
fi
if [[ "$(uname -s)" != 'Linux' ]] || ! command -v ffmpeg >/dev/null 2>&1 || ! command -v xvfb-run >/dev/null 2>&1; then
  echo 'Subtitled recording requires Linux, ffmpeg, and xvfb-run' >&2
  exit 1
fi

export VIDEO_SUBTITLES CAPTION_PACE_MS CAPTION_TYPING_DURATION_MS SCREEN_SIZE RAW_VIDEO_FILE FFMPEG_LOG
mkdir -p "${VIDEO_DIR}"
rm -f "${VIDEO_FILE}" "${RAW_VIDEO_FILE}" "${SUBTITLES_FILE}" "${CHAPTERS_FILE}"

# Record the same Xvfb display used by the Electron-based Playwright runner.
xvfb-run --auto-servernum --server-args="${SERVER_ARGS}" -- \
  bash -c '
    set +e
    display_input="${DISPLAY}"
    if [[ "${display_input}" != *.* ]]; then
      display_input="${display_input}.0"
    fi

    export VIDEO_RECORDING_STARTED_AT="$(date +%s%3N)"
    ffmpeg -y -nostdin -hide_banner \
      -f x11grab -video_size "${SCREEN_SIZE}" -framerate 15 -i "${display_input}" \
      -an -codec:v libx264 -pix_fmt yuv420p -preset ultrafast -crf 28 \
      -movflags +frag_keyframe+empty_moov+default_base_moof \
      "${RAW_VIDEO_FILE}" >"${FFMPEG_LOG}" 2>&1 &
    FFMPEG_PID=$!

    stop_ffmpeg() {
      kill -INT "${FFMPEG_PID}" 2>/dev/null || true
      wait "${FFMPEG_PID}" 2>/dev/null || true
    }
    trap stop_ffmpeg EXIT

    sleep 1
    if ! kill -0 "${FFMPEG_PID}" 2>/dev/null; then
      echo "ffmpeg failed to start; log follows:" >&2
      cat "${FFMPEG_LOG}" >&2 || true
      exit 1
    fi

    echo "Recording xvfb ${display_input} to ${RAW_VIDEO_FILE}"
    npx playwright test src/ --grep @integration
    exit $?
  '
status=$?

# The reporter has finalized the timed ASS captions and chapter metadata.
if [[ -f "${RAW_VIDEO_FILE}" && -f "${SUBTITLES_FILE}" ]]; then
  metadata_args=()
  if [[ -f "${CHAPTERS_FILE}" ]]; then
    metadata_args=(-i "${CHAPTERS_FILE}" -map_metadata 1)
  fi

  if ffmpeg -y -nostdin -hide_banner -i "${RAW_VIDEO_FILE}" "${metadata_args[@]}" -map 0:v:0 \
    -vf "subtitles=${SUBTITLES_FILE}" -an -codec:v libx264 -pix_fmt yuv420p -preset ultrafast -crf 28 \
    "${VIDEO_FILE}" >>"${FFMPEG_LOG}" 2>&1; then
    rm -f "${RAW_VIDEO_FILE}"
  else
    echo 'Subtitle rendering failed; retaining the raw recording.' >&2
    status=1
  fi
else
  echo 'The recording or subtitle track was not produced.' >&2
  status=1
fi

echo 'xvfb recordings:'
ls -lah "${VIDEO_DIR}" || true
if [[ -f "${FFMPEG_LOG}" ]]; then
  echo 'ffmpeg log (tail):'
  tail -n 20 "${FFMPEG_LOG}" || true
fi
exit "${status}"

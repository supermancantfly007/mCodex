#!/bin/sh

set -eu

: "${MCODEX_VPS_HOST:?MCODEX_VPS_HOST is required}"
: "${MCODEX_VPS_USER:?MCODEX_VPS_USER is required}"
: "${MCODEX_VPS_TUNNEL_PORT:?MCODEX_VPS_TUNNEL_PORT is required}"

exec ssh -NT \
  -i /run/secrets/mcodex_vps_ssh_key \
  -o BatchMode=yes \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o StrictHostKeyChecking=accept-new \
  -o UserKnownHostsFile=/state/known_hosts \
  -R "127.0.0.1:${MCODEX_VPS_TUNNEL_PORT}:mcodex:3210" \
  "${MCODEX_VPS_USER}@${MCODEX_VPS_HOST}"

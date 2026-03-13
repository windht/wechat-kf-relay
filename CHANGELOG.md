# Changelog

All notable changes to this project will be documented in this file.

This file exists so the Changesets GitHub Action can create release PRs and GitHub releases for the root package without failing when it reads the package changelog.

## 0.3.0 - 2026-03-14

- add paginated WeChat KF account discovery via `kf/account/list`
- expose `kf_accounts` and `subscribed_open_kfid` in relay snapshots
- require websocket clients to `subscribeTo(openKfId)` before receiving scoped traffic
- restrict websocket `send_text` and `message_on_event` flows to the subscribed `open_kfid`

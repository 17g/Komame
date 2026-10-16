\# AGENTS.md



\## 1. プロジェクト概要 \& 技術スタック

\- Framework: Streamlit

\- Language: Python (venv: env)

\- Package Manager: pip



\## 2. 検証コマンド (Verification Ground Truth)

エージェントはコード修正後、以下のコマンドを実行して正常終了（Exit Code 0）を確認すること。

\- 構文チェック: `python -m py\_compile <メインファイル名>.py`

\- 単体テスト: `pytest` （※テストコードがある場合。なければ「テストコードが存在する場合のみ pytest を実行」と記述）



\## 3. 参照ディレクトリ

\- 仕様書正本: `for\_agent/` 配下のすべての .md ファイル

\- 進捗管理: `Plan.md`

\- 変更ログ: `AICHANGELOG.md`


# AI HUB

検索・コード・画像の3ジャンルをユーザーが選び、ProviderはAI HUBが無料枠の中から自動選択するNext.js/PWAです。

検索はクレカ不要のSearXNG公開インスタンスから情報を集め、Geminiなど無料枠のAIで要約します。コードはGroq、Gemini、OpenRouter Free、Cloudflare Workers AIの順でフォールバックします。画像はHugging FaceのQwen-Image.2.1 ZeroGPUを第一候補にし、利用可能な無料のCloudflare画像モデルを予備にできます。

## GitHub直接反映

コードモードではGitHub OAuthで接続したあと、owner/repoを入力すると、AIがリポジトリのファイル一覧を確認し、変更が必要なファイルだけを読み、必要最小限の変更をGitHubへ直接反映します。GitHub API自体は無料です。AIHUB側でも有料AIへの自動切替は行いません。

GitHub OAuth AppのCallback URLは、本番URLが https://YOUR-DOMAIN の場合、
https://YOUR-DOMAIN/api/github/callback
にします。

必要な環境変数:
- GITHUB_CLIENT_ID
- GITHUB_CLIENT_SECRET
- GITHUB_SESSION_SECRET（十分長いランダム文字列）
- GITHUB_CALLBACK_URL（任意。Vercel本番URLを固定したい場合）
- GITHUB_OAUTH_SCOPE（任意。初期値は public_repo。private repoも扱う場合は repo）

## 環境変数

GEMINI_API_KEY / GEMINI_MODEL
GROQ_API_KEY / GROQ_MODEL
OPENROUTER_API_KEY / OPENROUTER_MODEL
CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN / CLOUDFLARE_MODEL / CLOUDFLARE_IMAGE_MODEL
HF_TOKEN / HF_SPACE_ID / HF_IMAGE_API_NAME
ALLOW_PAID_AI=false

APIキーはサーバー側だけで使用します。無料枠の残量を取得できないProviderについては推測せず「取得不可」と表示します。有料Providerは実装せず、ALLOW_PAID_AI=trueにしても有料APIへ自動フォールバックしません。

GitHubのOAuthアクセストークンはブラウザのHttpOnly暗号化Cookieに保存し、画面のJavaScriptから直接読めないようにしています。
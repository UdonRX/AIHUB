# AI HUB

検索・コード・画像の3ジャンルをユーザーが選び、ProviderはAI HUBが無料枠の中から自動選択するNext.js/PWAです。

検索はBrave Searchで情報を集め、Geminiを第一候補として要約します。Geminiが使えない場合はGroq、OpenRouter Free、Cloudflare Workers AIへ切り替えます。コードはGroq、Gemini、OpenRouter Free、Cloudflare Workers AIの順です。画像はHugging FaceのQwen-Image-2.1 ZeroGPUを第一候補にし、任意でCloudflareの画像モデルを予備にできます。

環境変数:
GEMINI_API_KEY / GEMINI_MODEL
GROQ_API_KEY / GROQ_MODEL
OPENROUTER_API_KEY / OPENROUTER_MODEL
BRAVE_SEARCH_API_KEY
CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN / CLOUDFLARE_MODEL / CLOUDFLARE_IMAGE_MODEL
HF_TOKEN / HF_SPACE_ID / HF_IMAGE_API_NAME
ALLOW_PAID_AI=false

APIキーはサーバー側だけで使用します。無料枠の残量を取得できないProviderについては推測せず「取得不可」と表示します。ALLOW_PAID_AI=trueでもv1には有料Providerを実装していないため、有料APIへ自動フォールバックしません。

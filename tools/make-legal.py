# 規約まわりのページ（利用規約・プライバシーポリシー・特定商取引法に基づく表記）を日本語版と英語版で作る。
#   python3 tools/make-legal.py
# 運営者の情報は下の SELLER に入れる。空欄のままなら「請求があれば開示」「準備中」と表示する。
# ※ メールアドレスは公開してよい窓口用のものを入れること（個人のアドレスは載せない）。
import html, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
UPDATED = ('2026年10月13日', 'October 13, 2026')

SELLER = {
    'name': '',      # 販売業者（屋号・氏名）。空欄なら請求時に開示
    'manager': '',   # 運営責任者
    'address': '',   # 所在地
    'phone': '',     # 電話番号
    'email': 'yoneken@mail.grokbot.com',  # 問い合わせ用メールアドレス（公開用・本人の指定）
}

def v(key, ja=True):
    val = SELLER[key]
    if val:
        if key == 'email':
            e = html.escape(val)
            return f'<a href="mailto:{e}">{e}</a>'
        return html.escape(val)
    if key == 'email':
        return ('準備中です（有料プランの正式な受付開始までに掲載します）' if ja
                else 'Being prepared (will be listed before paid sign-ups officially open)')
    return ('請求があった場合には、遅滞なく電子メールにて開示いたします' if ja
            else 'Will be disclosed without delay by email upon request')

CONTACT_JA = 'お問い合わせは、<a href="tokushoho.html">特定商取引法に基づく表記</a>に記載の連絡先までお願いします。'
CONTACT_EN = 'For enquiries, please use the contact listed in the <a href="tokushoho.html">Legal notice</a>.'

PAGES = {}

# ------------------------------------------------------------------ 特定商取引法に基づく表記
PAGES['tokushoho'] = (
    ('特定商取引法に基づく表記', 'KANPE の有料プラン（お手軽プラン）の販売に関する表示です。'),
    ('Legal notice (Specified Commercial Transactions Act)', 'Disclosures required under Japan’s Act on Specified Commercial Transactions for KANPE’s paid plan.'),
    lambda ja: '<dl class="legal-table">' + ''.join(f'<dt>{k}</dt><dd>{d}</dd>' for k, d in (
        [('販売業者', v('name')), ('運営責任者', v('manager')), ('所在地', v('address')), ('電話番号', v('phone')),
         ('メールアドレス', v('email')),
         ('サービス名', 'KANPE（リアルタイムカンペ）'),
         ('販売価格', 'お手軽プラン　月払い 480円 / 月、年払い 4,800円 / 年（いずれも税込）<br>おトクプラン　2,980円 / 月、29,800円 / 年（税込・現在は受付前です）'),
         ('商品代金以外の必要料金', 'インターネットの接続料金・通信料金はお客様のご負担となります。'),
         ('お支払い方法', 'クレジットカード・デビットカードほか、Stripe のお支払い画面で表示される方法'),
         ('お支払いの時期', 'お申し込み時に初回分をお支払いいただき、以後は月払いなら毎月、年払いなら毎年、お申し込み日と同じ日に自動で更新・決済されます。'),
         ('提供の時期', '決済の完了後、ただちにご利用いただけます。'),
         ('解約・返金', 'いつでも、コンソールのプラン表示から開く契約管理ページで解約できます。解約後も、お支払い済みの期間の終わりまでご利用いただけ、次回以降の請求は発生しません。デジタルサービスの性質上、お支払い済みの料金の返金（日割りを含む）はいたしません。ただし、当方の不具合によりサービスを提供できなかった場合はこの限りではありません。'),
         ('動作環境', '音声認識：PC の Chrome / Edge、Android の Chrome、iPhone の Safari（いずれも最新版）。マイクが必要です。表示ビューは OBS のブラウザソースを含む主要なブラウザで動作します。'),
         ('ベータ版について', '本サービスはベータ版として提供しています。機能や表示は予告なく変更される場合があります。')]
        if ja else
        [('Seller', v('name', False)), ('Representative', v('manager', False)), ('Address', v('address', False)),
         ('Phone', v('phone', False)), ('Email', v('email', False)),
         ('Service', 'KANPE (real-time cue cards)'),
         ('Price', 'Plus plan — ¥480 / month or ¥4,800 / year (tax included)<br>Pro plan — ¥2,980 / month or ¥29,800 / year (tax included; not yet open for sign-up)'),
         ('Additional fees', 'Internet connection and data charges are borne by the customer.'),
         ('Payment methods', 'Credit and debit cards, and other methods shown on the Stripe checkout page'),
         ('Payment timing', 'The first payment is charged at sign-up. The plan then renews and is charged automatically every month (monthly) or every year (yearly) on the same date.'),
         ('Delivery', 'Available immediately after payment is completed.'),
         ('Cancellation and refunds', 'You can cancel at any time from the billing page opened from the plan badge in the console. After cancelling, you can keep using the plan until the end of the period you have paid for, and you will not be charged again. Due to the nature of digital services, payments already made are not refunded (including pro-rata refunds), except where we were unable to provide the service because of a fault on our side.'),
         ('System requirements', 'Speech recognition: Chrome / Edge on desktop, Chrome on Android, Safari on iPhone (latest versions), with a microphone. The display view works in major browsers including OBS browser sources.'),
         ('Beta', 'The service is provided as a beta. Features and design may change without notice.')]
    )) + '</dl>',
)

# ------------------------------------------------------------------ 利用規約
def terms(ja):
    S = [
        ('第1条（適用）', 'この規約は、KANPE（以下「本サービス」）の運営者（以下「当方」）が提供する本サービスの利用条件を定めるものです。本サービスを利用した時点で、この規約に同意したものとみなします。',
         '1. Scope', 'These terms set out the conditions for using KANPE (the “Service”) provided by its operator (“we”). By using the Service, you agree to these terms.'),
        ('第2条（本サービスの内容）', '本サービスは、ブラウザの音声認識機能を使って話した言葉を文字にし、配信画面などに表示するツールです。文字起こしや設定はお使いのブラウザの中に保存され、当方のサーバーには送信・保存されません。音声を文字にする処理は、ブラウザの提供元（Google、Microsoft、Apple など）のサービスが行います。',
         '2. The Service', 'The Service turns your speech into text using your browser’s speech recognition and shows it on your stream or screen. Transcripts and settings are stored in your browser and are not sent to or stored on our servers. Speech-to-text processing is performed by your browser’s provider (such as Google, Microsoft or Apple).'),
        ('第3条（ベータ版）', '本サービスはベータ版です。当方は、予告なく機能の追加・変更・停止を行うことがあります。認識の精度や表示の正確さ、特定の目的への適合性は保証しません。',
         '3. Beta', 'The Service is a beta. We may add, change or suspend features without notice. We do not guarantee recognition accuracy, display accuracy or fitness for a particular purpose.'),
        ('第4条（有料プラン）', '有料プランの料金、支払い時期、提供時期は<a href="tokushoho.html">特定商取引法に基づく表記</a>のとおりです。お支払いは決済代行サービス Stripe を通じて行い、カード情報を当方が受け取ることはありません。有料プランは解約されるまで自動で更新されます。解約はいつでもでき、お支払い済みの期間の終わりまで利用できます。お支払い済みの料金は、法令で定める場合または当方の責めによる場合を除き返金しません。',
         '4. Paid plans', 'Prices, payment timing and delivery of paid plans are as stated in the <a href="tokushoho.html">Legal notice</a>. Payments are processed by Stripe, and we never receive your card details. Paid plans renew automatically until cancelled. You can cancel at any time and keep using the plan until the end of the paid period. Payments made are not refunded except where required by law or where we are at fault.'),
        ('第5条（ライセンス）', '有料プランの利用権は、お使いのブラウザに保存されるライセンスコードで確認します。ライセンスコードはご本人の利用のためのものです。第三者への譲渡・共有・販売はできません。当方は、不正な利用を確認した場合、ライセンスを無効にできます。',
         '5. License', 'Your paid plan is verified by a license code stored in your browser. The code is for your own use only and may not be transferred, shared or sold. We may revoke a license if we find it is being misused.'),
        ('第6条（禁止事項）', '法令や公序良俗に反する行為、他人の権利を侵害する行為、本サービスやそのサーバーに過度な負荷をかけたり、機能の制限を不正に回避したりする行為、本サービスの運営を妨げる行為を禁止します。',
         '6. Prohibited conduct', 'You must not break the law or public order, infringe the rights of others, overload the Service or its servers, circumvent feature restrictions, or otherwise interfere with the operation of the Service.'),
        ('第7条（表示する内容の責任）', '本サービスで表示・配信する内容は利用者の責任で管理してください。誤認識により意図しない言葉が表示される場合があります。必要に応じて NG ワード機能などをご利用ください。',
         '7. Your content', 'You are responsible for what you display and broadcast using the Service. Misrecognition may cause unintended words to appear; use the NG-word filter and other features as needed.'),
        ('第8条（知的財産）', '本サービスのプログラム、デザイン、ロゴなどの権利は当方または正当な権利者に帰属します。利用者が話した内容の権利は利用者に帰属します。',
         '8. Intellectual property', 'Rights in the Service’s software, design and logo belong to us or their rightful owners. Rights in what you say remain yours.'),
        ('第9条（免責）', '当方は、本サービスの利用または利用できなかったことにより生じた損害について、当方の故意または重大な過失による場合を除き、責任を負いません。当方が責任を負う場合でも、その額は損害が生じた月に利用者が当方に支払った利用料金を上限とします。',
         '9. Limitation of liability', 'Except in cases of our wilful misconduct or gross negligence, we are not liable for damages arising from use of, or inability to use, the Service. Where we are liable, our liability is limited to the fees you paid us in the month the damage occurred.'),
        ('第10条（サービスの変更・終了）', '当方は、本サービスの内容を変更し、または提供を終了することがあります。有料プランの提供を終了する場合は、相当の期間をおいて本サービス上でお知らせし、残りの期間に応じた対応を行います。',
         '10. Changes and termination', 'We may change or discontinue the Service. If we discontinue a paid plan, we will give reasonable notice on the Service and handle the remaining period appropriately.'),
        ('第11条（規約の変更）', '当方は、必要に応じてこの規約を変更できます。重要な変更は本サービス上でお知らせし、変更後に本サービスを利用した場合は変更に同意したものとみなします。',
         '11. Changes to these terms', 'We may update these terms. We will announce material changes on the Service, and continued use after a change means you accept it.'),
        ('第12条（準拠法・管轄）', 'この規約は日本法に従って解釈されます。本サービスに関して紛争が生じた場合は、当方の所在地を管轄する地方裁判所を第一審の専属的合意管轄裁判所とします。',
         '12. Governing law', 'These terms are governed by the laws of Japan. The district court with jurisdiction over our location has exclusive jurisdiction in the first instance. If there is any inconsistency, the Japanese version prevails.'),
    ]
    out = ''.join(f'<h2>{a if ja else c}</h2><p>{b if ja else d}</p>' for a, b, c, d in S)
    return out + f'<p class="legal-contact">{CONTACT_JA if ja else CONTACT_EN}</p>'

PAGES['terms'] = (('利用規約', 'KANPE をご利用いただく際の約束ごとです。'),
                  ('Terms of service', 'The terms for using KANPE.'), terms)

# ------------------------------------------------------------------ プライバシーポリシー
def privacy(ja):
    S = [
        ('基本の考え方', 'KANPE は、配信の内容を安心して扱えるよう、できるだけ情報を受け取らない設計にしています。文字起こし、設定、背景画像、OBS の接続情報は、お使いのブラウザの中にだけ保存され、当方のサーバーに送信・保存されることはありません。アカウント登録もありません。',
         'Our approach', 'KANPE is designed to collect as little as possible so you can use it with confidence. Transcripts, settings, background images and OBS connection details are stored only in your browser and are never sent to or stored on our servers. There are no accounts.'),
        ('音声認識について', '無料・お手軽プランの音声認識は、ブラウザに内蔵された機能を使います。音声はブラウザの提供元（Chrome は Google、Edge は Microsoft、Safari は Apple）のサービスで文字にされ、その取り扱いは各社のプライバシーポリシーに従います。音声が当方に届くことはありません。',
         'Speech recognition', 'On the Free and Plus plans, speech recognition uses your browser’s built-in feature. Audio is converted to text by your browser’s provider (Google for Chrome, Microsoft for Edge, Apple for Safari) under their privacy policies. Audio never reaches us.'),
        ('有料プランで扱う情報', 'お支払いは決済代行サービス Stripe（Stripe, Inc.）の画面で行います。メールアドレス、お名前、カード情報などは Stripe が受け取って管理し、カード情報を当方が受け取ることはありません。当方は契約の確認のために、Stripe の顧客 ID、プラン、契約期間、お申し込み時のメールアドレスを Stripe から都度参照します。当方はこれらを独自のデータベースに保存せず、確認の結果は署名つきのライセンスコードとしてお使いのブラウザに保存します。また、ライセンスコードをお届けするため、お申し込み時のメールアドレス宛てに、メール配信サービス Resend（Resend, Inc.）を通じてメールを送ります。コードの再送を依頼された場合、入力されたメールアドレスは該当するご契約を探すためだけに使い、メールは Stripe に登録されたアドレスにのみ送ります。',
         'Information for paid plans', 'Payments are handled on the checkout page of Stripe, Inc. Stripe receives and manages your email address, name and card details; we never receive your card details. To verify your subscription, we look up your Stripe customer ID, plan, subscription period and sign-up email from Stripe when needed. We do not keep these in a database of our own; the result is stored in your browser as a signed license code. To deliver your license code, we email it to your sign-up address through Resend, Inc., an email delivery service. If you ask us to resend the code, the address you enter is used only to look up a matching subscription, and the email is sent only to the address registered with Stripe.'),
        ('アクセスの記録', '本サービスは Cloudflare, Inc. のサービスで配信しています。安全な運用のため、Cloudflare が IP アドレスやブラウザの種類などの技術的な情報を一時的に処理することがあります。広告や解析のタグ、外部のトラッキング用スクリプトは使っていません。',
         'Access logs', 'The Service is delivered via Cloudflare, Inc. For security and reliability, Cloudflare may temporarily process technical information such as IP addresses and browser type. We use no advertising or analytics tags and no third-party tracking scripts.'),
        ('利用目的', '当方が参照する情報は、有料プランの提供と契約の確認、お問い合わせへの対応、不正利用の防止のためだけに使います。',
         'Purpose of use', 'We use the information we access only to provide paid plans and verify subscriptions, respond to enquiries and prevent misuse.'),
        ('第三者への提供', '法令に基づく場合を除き、個人情報をご本人の同意なく第三者に提供しません。決済のための Stripe、配信のための Cloudflare、メール送信のための Resend は、それぞれの業務に必要な範囲で情報を取り扱います（いずれも国外の事業者を含みます）。',
         'Sharing with third parties', 'Except as required by law, we do not share personal information with third parties without your consent. Stripe (payments), Cloudflare (delivery) and Resend (email) handle information only as needed for their services; all include providers outside Japan.'),
        ('ブラウザに保存される情報', 'このブラウザには、設定、文字起こし、ライセンスコードなどが保存されます。コンソールの「消去」ボタンや、ブラウザのサイトデータの削除でいつでも消せます。ライセンスコードを消した場合も、「ライセンスコードで復元」から戻せます。',
         'Data stored in your browser', 'Your browser stores settings, transcripts and your license code. You can delete them at any time with the console’s Clear button or by clearing site data in your browser. If you delete your license code, you can restore it with “Restore with a license code”.'),
        ('開示・訂正・削除のご請求', 'ご本人からの開示・訂正・利用停止・削除のご請求には、法令に従い対応します。Stripe に保存された情報は、契約管理ページからも確認・変更できます。',
         'Your rights', 'We respond to requests for disclosure, correction, suspension or deletion in accordance with the law. You can also view and update the information held by Stripe from the billing page.'),
        ('改定', 'このポリシーは必要に応じて改定し、本ページでお知らせします。',
         'Changes', 'We may update this policy and will post changes on this page.'),
    ]
    out = ''.join(f'<h2>{a if ja else c}</h2><p>{b if ja else d}</p>' for a, b, c, d in S)
    return out + f'<p class="legal-contact">{CONTACT_JA if ja else CONTACT_EN}</p>'

PAGES['privacy'] = (('プライバシーポリシー', 'KANPE が扱う情報と、その取り扱いについて。'),
                    ('Privacy policy', 'What information KANPE handles, and how.'), privacy)

ORDER = [('terms', '利用規約', 'Terms'), ('privacy', 'プライバシー', 'Privacy'), ('tokushoho', '特定商取引法に基づく表記', 'Legal notice')]

THEME_JS = "try{var t=localStorage.getItem('kanpe.ui');t=(t==='light'||t==='dark')?t:null;if(t)document.documentElement.dataset.theme=t;document.documentElement.dataset.mode=t||'light'}catch(e){}"
MOON = '<svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/></svg>'
SUN = '<svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>'

def page(slug, ja):
    (tj, lj), (te, le), body = PAGES[slug]
    title, lede = (tj, lj) if ja else (te, le)
    up = '../' if ja else '../../'           # サイトのルートへ
    home = '../index.html' if ja else '../index.html'  # 同じ言語のトップ
    other = f'../en/legal/{slug}.html' if ja else f'../../legal/{slug}.html'
    url = f'https://kanpe.yoneken.xyz/{"" if ja else "en/"}legal/{slug}.html'
    alt_ja = f'https://kanpe.yoneken.xyz/legal/{slug}.html'
    alt_en = f'https://kanpe.yoneken.xyz/en/legal/{slug}.html'
    cur = ' aria-current="page"'
    nav = ''.join(f'<a href="{s}.html"{cur if s == slug else ""}>{j if ja else e}</a>' for s, j, e in ORDER)
    fonts = ('family=Shippori+Mincho+B1:wght@500;700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=IBM+Plex+Mono:wght@400;500'
             if ja else 'family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=Shippori+Mincho+B1:wght@700&family=IBM+Plex+Mono:wght@400;500')
    return f'''<!doctype html>
<html lang="{"ja" if ja else "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}｜KANPE</title>
<meta name="description" content="{html.escape(lede)}">
<link rel="canonical" href="{url}">
<link rel="alternate" hreflang="ja" href="{alt_ja}">
<link rel="alternate" hreflang="en" href="{alt_en}">
<link rel="icon" href="{up}assets/icon.svg" type="image/svg+xml">
<link rel="icon" href="{up}assets/favicon-32.png" sizes="32x32" type="image/png">
<meta name="theme-color" content="#f5f3ee">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{fonts}&display=swap">
<link rel="stylesheet" href="{up}styles/lp.css">
<script>{THEME_JS}</script>
</head>
<body id="top" class="legal-page">
<header class="nav scrolled">
  <a class="logo" href="{home}" aria-label="{"KANPE トップ" if ja else "KANPE home"}"><span class="tally" aria-hidden="true"></span>KANPE<span class="beta mono">BETA</span></a>
  <nav class="links" id="siteMenu" aria-label="{"規約" if ja else "Legal"}">{nav}
    <div class="menu-extra">
      <a class="menu-row" href="{other}" hreflang="{"en" if ja else "ja"}" lang="{"en" if ja else "ja"}" data-lang-switch><span class="mi" aria-hidden="true">{"EN" if ja else "JA"}</span>{"English" if ja else "日本語"}</a>
      <button class="menu-row" type="button" data-mode-toggle><span class="mi" aria-hidden="true">{MOON}{SUN}</span><span class="when-light">{"ダークモード" if ja else "Dark mode"}</span><span class="when-dark">{"ライトモード" if ja else "Light mode"}</span></button>
    </div>
  </nav>
  <a class="lang-link" href="{other}" hreflang="{"en" if ja else "ja"}" lang="{"en" if ja else "ja"}" data-lang-switch title="{"English version" if ja else "日本語版"}">{"EN" if ja else "JA"}</a>
  <button class="mode-btn" type="button" data-mode-toggle aria-label="{"表示モードを切り替える" if ja else "Toggle light or dark mode"}">{MOON}{SUN}</button>
  <a class="btn btn-ink small" href="{"../app.html" if ja else "../app.html"}">{"無料で使う" if ja else "Try free"}</a>
  <button class="menu-btn" type="button" data-menu-btn aria-controls="siteMenu" aria-expanded="false" aria-label="{"メニュー" if ja else "Menu"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="b1" d="M4 7h16"/><path class="b2" d="M4 12h16"/><path class="b3" d="M4 17h16"/></svg></button>
</header>
<main class="legal">
  <p class="label mono">LEGAL</p>
  <h1>{title}</h1>
  <p class="legal-lede">{lede}</p>
  {body(ja)}
  <p class="fine legal-updated">{"最終更新" if ja else "Last updated"}：{UPDATED[0] if ja else UPDATED[1]}</p>
</main>
<footer class="foot">
  <span class="logo small"><span class="tally" aria-hidden="true"></span>KANPE</span>
  <nav class="foot-links" aria-label="{"フッター" if ja else "Footer"}">
    <a href="{home}">{"トップ" if ja else "Home"}</a>
    <a href="../app.html">{"コンソール" if ja else "Console"}</a>
    {nav}
  </nav>
  <span class="fine">© 2026 KANPE · {"ベータ版" if ja else "Beta"}</span>
</footer>
<script src="{up}src/ui/lang.js" defer></script>
<script src="{up}src/ui/menu.js" defer></script>
<script src="{up}src/ui/mode.js" defer></script>
</body>
</html>
'''

for slug in PAGES:
    for ja in (True, False):
        out = ROOT / ('legal' if ja else 'en/legal') / f'{slug}.html'
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page(slug, ja))
        print('wrote', out.relative_to(ROOT))
